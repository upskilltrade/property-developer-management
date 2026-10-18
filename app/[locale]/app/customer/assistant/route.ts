import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { AI_FALLBACK, AI_MODEL } from "@/lib/ai";
import {
  CUSTOMER_DAILY_LIMIT,
  CUSTOMER_SYSTEM_PROMPT,
  loadCustomerContext,
} from "@/lib/customer-assistant";

export const maxDuration = 120;

const MAX_TURNS = 20;
const MAX_CHARS = 2000;

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
 * Homebuyer assistant, as newline-delimited JSON ({type:"text"} | {type:"error"}, then
 * {type:"done"}). The answer is grounded in data loaded through the customer's own session.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: "not_configured" }, { status: 503 });

  const turns = parseTurns(await req.json().catch(() => null));
  if (!turns) return new Response("Bad request", { status: 400 });

  const context = await loadCustomerContext(supabase, locale);
  if (!context.houses.length) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const line = (event: Record<string, unknown>) => encoder.encode(JSON.stringify(event) + "\n");
  const respond = (events: Record<string, unknown>[]) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const e of [...events, { type: "done" }]) c.enqueue(line(e));
          c.close();
        },
      }),
      {
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );

  const { count } = await supabase
    .from("assistant_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .contains("tools", ["customer"])
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= CUSTOMER_DAILY_LIMIT)
    return respond([{ type: "error", message: "daily_limit" }]);

  const question = turns[turns.length - 1].content;
  let tokensIn = 0;
  let tokensOut = 0;
  let stop = "error";
  const events: Record<string, unknown>[] = [];
  try {
    const response = await new Anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: [
        { type: "text", text: CUSTOMER_SYSTEM_PROMPT },
        {
          type: "text",
          text: `CUSTOMER DATA (UI language: ${locale}):\n${JSON.stringify(context)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: turns,
      output_config: { effort: "low" },
      ...AI_FALLBACK,
    });
    tokensIn = response.usage.input_tokens;
    tokensOut = response.usage.output_tokens;
    stop = response.stop_reason ?? "unknown";
    if (response.stop_reason === "refusal") events.push({ type: "error", message: "refusal" });
    else
      events.push({
        type: "text",
        text: response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim(),
        truncated: response.stop_reason === "max_tokens",
      });
  } catch (e) {
    console.error("customer assistant failed", e);
    events.push({
      type: "error",
      message: e instanceof Anthropic.RateLimitError ? "rate_limit" : "generic",
    });
  }
  await supabase.rpc("log_assistant_turn", {
    question_text: question,
    tools_used: ["customer"],
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    stop,
  });
  return respond(events);
}
