import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, aiErrorKey, extractQuotation, quoteDocTypes } from "@/lib/ai";

export const maxDuration = 120;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Reads a supplier quotation with AI and returns the fields for the quotation form. The file goes
 * to the model only; nothing is stored, and the user reviews the values before saving.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "generic" }, { status: 401 });
  const { data: allowed } = await supabase.rpc("can_procure", {
    target_project: id,
    target_action: "CREATE",
  });
  if (allowed !== true) return Response.json({ error: "permission" }, { status: 403 });
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "generic" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  if (!quoteDocTypes.has(file.type)) return Response.json({ error: "bad_type" }, { status: 415 });

  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const result = await extractQuotation({
      media_type: file.type,
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    });
    usage = result.usage;
    return Response.json({ quote: result.quote });
  } catch (e) {
    console.error("quotation extraction failed", e);
    return Response.json({ error: aiErrorKey(e) }, { status: 502 });
  } finally {
    await supabase.rpc("log_assistant_turn", {
      question_text: `[quote-extract] ${file.name}`.slice(0, 300),
      tools_used: ["quote_extraction"],
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      stop: usage.output_tokens ? "end_turn" : "error",
    });
  }
}
