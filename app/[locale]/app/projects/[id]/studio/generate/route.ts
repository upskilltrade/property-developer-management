import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ImageProviderError,
  buildPrompt,
  generateImage,
  imageProviders,
  studioAspects,
  studioLighting,
  studioPurposes,
  studioScenes,
  studioStyles,
  type ImageProvider,
} from "@/lib/image-ai";

export const maxDuration = 300;
const MAX_REFERENCE = 10 * 1024 * 1024;
const referenceTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const pick = <T extends readonly string[]>(
  list: T,
  v: FormDataEntryValue | null,
): T[number] | null =>
  (list as readonly string[]).includes(String(v ?? "")) ? (String(v) as T[number]) : null;
const text = (fd: FormData, k: string, max: number) =>
  String(fd.get(k) ?? "")
    .trim()
    .slice(0, max);

/**
 * Generates one Design Studio render. Reference and output images are uploaded with the user's
 * own session (storage policy can_upload_render) and recorded by save_design_render.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "generic" }, { status: 401 });
  const [{ data: canEdit }, { data: project }] = await Promise.all([
    supabase.rpc("can_design", { target_project: id, target_action: "EDIT" }),
    supabase.from("projects").select("organization_id").eq("id", id).maybeSingle(),
  ]);
  if (canEdit !== true || !project) return Response.json({ error: "permission" }, { status: 403 });

  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "invalid" }, { status: 400 });
  const provider = pick(imageProviders, fd.get("provider")) as ImageProvider | null;
  const scene = pick(studioScenes, fd.get("scene"));
  const style = pick(studioStyles, fd.get("style"));
  const lighting = pick(studioLighting, fd.get("lighting"));
  const aspect = pick(studioAspects, fd.get("aspect"));
  const purpose = pick(studioPurposes, fd.get("purpose")) ?? "INTERNAL";
  if (!provider || !scene || !style || !lighting || !aspect)
    return Response.json({ error: "invalid" }, { status: 400 });
  const unitId = text(fd, "unit_id", 64) || null;
  const parentId = text(fd, "parent_render_id", 64) || null;

  // Reference image: an upload, or an earlier render to iterate on.
  let reference: { data: Buffer; mimeType: string } | null = null;
  const file = fd.get("file");
  if (file instanceof File && file.size) {
    if (file.size > MAX_REFERENCE) return Response.json({ error: "too_large" }, { status: 413 });
    if (!referenceTypes.has(file.type))
      return Response.json({ error: "bad_type" }, { status: 415 });
    reference = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type };
  } else if (parentId) {
    const { data: parent } = await supabase
      .from("design_renders")
      .select("output_path,project_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.project_id !== id)
      return Response.json({ error: "invalid" }, { status: 400 });
    const { data: blob } = await supabase.storage
      .from("design-renders")
      .download(parent.output_path);
    if (!blob) return Response.json({ error: "invalid" }, { status: 400 });
    reference = {
      data: Buffer.from(await blob.arrayBuffer()),
      mimeType: blob.type || "image/jpeg",
    };
  }

  const brief = text(fd, "notes", 1500);
  const prompt = buildPrompt({
    scene,
    style,
    lighting,
    materials: text(fd, "materials", 500),
    furniture: fd.get("furniture") === "on",
    landscape: fd.get("landscape") === "on",
    people: fd.get("people") === "on",
    notes: brief,
    hasReference: Boolean(reference),
  });

  const renderId = crypto.randomUUID();
  const folder = `${project.organization_id}/${id}/${renderId}`;
  let outcome = "error";
  try {
    const image = await generateImage({ provider, prompt, aspect, reference });
    const ext = (m: string) => (m === "image/png" ? "png" : m === "image/webp" ? "webp" : "jpg");
    let sourcePath: string | null = null;
    if (reference && file instanceof File) {
      sourcePath = `${folder}/reference.${ext(reference.mimeType)}`;
      const up = await supabase.storage
        .from("design-renders")
        .upload(sourcePath, reference.data, { contentType: reference.mimeType });
      if (up.error) sourcePath = null;
    }
    const outputPath = `${folder}/render.${ext(image.mimeType)}`;
    const up = await supabase.storage
      .from("design-renders")
      .upload(outputPath, image.data, { contentType: image.mimeType });
    if (up.error) return Response.json({ error: "storage" }, { status: 500 });
    const { error } = await supabase.rpc("save_design_render", {
      target_project: id,
      data: {
        id: renderId,
        unit_id: unitId,
        scene,
        style,
        purpose,
        provider,
        model: image.model,
        prompt,
        brief,
        source_path: sourcePath,
        output_path: outputPath,
        parent_render_id: parentId,
      },
    });
    if (error) return Response.json({ error: "invalid" }, { status: 400 });
    outcome = "end_turn";
    return Response.json({ id: renderId });
  } catch (e) {
    const key = e instanceof ImageProviderError ? e.key : "provider";
    outcome = key;
    return Response.json({ error: key }, { status: key === "not_configured" ? 503 : 502 });
  } finally {
    await supabase.rpc("log_assistant_turn", {
      question_text: `[design-studio] ${scene}/${style} ${brief}`.slice(0, 500),
      tools_used: [`image_${provider.toLowerCase()}`],
      tokens_in: 0,
      tokens_out: 0,
      stop: outcome,
    });
  }
}
