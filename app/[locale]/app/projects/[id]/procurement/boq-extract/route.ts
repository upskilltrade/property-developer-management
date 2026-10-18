import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, aiErrorKey, extractBoq, quoteDocTypes } from "@/lib/ai";

export const maxDuration = 300;
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Reads a BOQ document with AI and returns its lines for review. The file goes to the model only;
 * nothing is saved until the reviewer adds the lines to a draft budget version.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "generic" }, { status: 401 });
  const [{ data: canCreate }, { data: canEdit }] = await Promise.all([
    supabase.rpc("can_cost", { target_project: id, target_action: "CREATE" }),
    supabase.rpc("can_cost", { target_project: id, target_action: "EDIT" }),
  ]);
  if (canCreate !== true && canEdit !== true)
    return Response.json({ error: "permission" }, { status: 403 });
  if (!aiConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "generic" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  if (!quoteDocTypes.has(file.type)) return Response.json({ error: "bad_type" }, { status: 415 });

  const { data: categories } = await supabase
    .from("cost_categories")
    .select("code,name")
    .eq("active", true)
    .order("code");

  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const result = await extractBoq(
      { media_type: file.type, data: Buffer.from(await file.arrayBuffer()).toString("base64") },
      categories ?? [],
    );
    usage = result.usage;
    return Response.json({ boq: result.boq });
  } catch (e) {
    console.error("BOQ extraction failed", e);
    return Response.json({ error: aiErrorKey(e) }, { status: 502 });
  } finally {
    await supabase.rpc("log_assistant_turn", {
      question_text: `[boq-extract] ${file.name}`.slice(0, 300),
      tools_used: ["boq_extraction"],
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
      stop: usage.output_tokens ? "end_turn" : "error",
    });
  }
}
