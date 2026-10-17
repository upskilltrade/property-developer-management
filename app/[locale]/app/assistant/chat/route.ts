import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { ASSISTANT_MODEL, SYSTEM_PROMPT, assistantTools, createToolRunner } from "@/lib/assistant";
import { todayIso } from "@/lib/schedule";

export const maxDuration = 300;

const MAX_TURNS = 20;
const MAX_CHARS = 4000;
const MAX_STEPS = 8;
const externalRoles = new Set(["CUSTOMER", "CONTRACTOR", "INVESTOR"]);

type ChatTurn = { role: "user" | "assistant"; content: string };

function parseTurns(body: unknown): ChatTurn[] | null {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_TURNS) return null;
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    const role = (m as ChatTurn)?.role;
    const content = (m as ChatTurn)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    if (!content.trim() || content.length > MAX_CHARS) return null;
    turns.push({ role, content });
  }
  return turns[0].role === "user" && turns[turns.length - 1].role === "user" ? turns : null;
}

/**
 * Assistant turn as newline-delimited JSON: {type:"tool"} while tools run, then {type:"text"}
 * with the answer, or {type:"error"}. Tools query through the caller's session, so answers are
 * limited to what this person may see.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: grants } = await supabase.rpc("current_access_profile");
  const internal = ((grants ?? []) as { role_code: string }[]).some(
    (g) => !externalRoles.has(g.role_code),
  );
  if (!internal) return new Response("Forbidden", { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: "not_configured" }, { status: 503 });

  const turns = parseTurns(await req.json().catch(() => null));
  if (!turns) return new Response("Bad request", { status: 400 });

  const runTool = createToolRunner(supabase, locale);
  const client = new Anthropic();
  const question = turns[turns.length - 1].content;
  // The date changes daily, so it rides on the latest user turn instead of the cached system prompt.
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t, i) => ({
    role: t.role,
    content:
      i === turns.length - 1
        ? `[Today: ${todayIso()} · UI language: ${locale}]\n${t.content}`
        : t.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const toolsUsed: string[] = [];
      let tokensIn = 0;
      let tokensOut = 0;
      let stop = "error";
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const response = await client.beta.messages.create({
            model: ASSISTANT_MODEL,
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            tools: assistantTools,
            messages,
            output_config: { effort: "medium" },
            cache_control: { type: "ephemeral" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          });
          tokensIn += response.usage.input_tokens;
          tokensOut += response.usage.output_tokens;
          stop = response.stop_reason ?? "unknown";

          if (response.stop_reason === "refusal") {
            send({ type: "error", message: "refusal" });
            break;
          }
          if (response.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: response.content });
            continue;
          }
          if (response.stop_reason === "tool_use") {
            const calls = response.content.filter(
              (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
            );
            messages.push({ role: "assistant", content: response.content });
            for (const c of calls) {
              toolsUsed.push(c.name);
              send({ type: "tool", name: c.name });
            }
            const results = await Promise.all(
              calls.map(
                async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => ({
                  type: "tool_result",
                  tool_use_id: c.id,
                  content: await runTool(c.name, c.input),
                }),
              ),
            );
            messages.push({ role: "user", content: results });
            continue;
          }
          const text = response.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();
          send({ type: "text", text, truncated: response.stop_reason === "max_tokens" });
          break;
        }
        if (stop === "tool_use") send({ type: "error", message: "too_many_steps" });
      } catch (e) {
        const message =
          e instanceof Anthropic.AuthenticationError
            ? "auth"
            : e instanceof Anthropic.RateLimitError
              ? "rate_limit"
              : e instanceof Anthropic.APIError
                ? `api_${e.status ?? "error"}`
                : "unknown";
        console.error("assistant failed", e);
        send({ type: "error", message });
      } finally {
        await supabase.rpc("log_assistant_turn", {
          question_text: question,
          tools_used: toolsUsed,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          stop,
        });
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
