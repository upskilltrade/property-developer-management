import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_IMPORT_ROWS, importKinds, type ImportKind } from "@/lib/import";

/**
 * Validates (dry run) or commits one import batch. All checks run in the database; a batch with
 * any failing row commits nothing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    rows?: unknown;
    fileName?: string;
    filePath?: string;
    dryRun?: boolean;
  } | null;
  const kind = body?.kind as ImportKind;
  if (
    !body ||
    !importKinds.includes(kind) ||
    !Array.isArray(body.rows) ||
    !body.rows.length ||
    body.rows.length > MAX_IMPORT_ROWS
  )
    return Response.json({ error: "invalid" }, { status: 400 });

  const dryRun = body.dryRun !== false;
  const { data, error } = await supabase.rpc("import_project_data", {
    target_project: id,
    kind,
    rows: body.rows,
    file_name: body.fileName?.slice(0, 200) ?? null,
    file_path: dryRun ? null : (body.filePath ?? null),
    dry_run: dryRun,
  });
  if (error)
    return Response.json(
      { error: error.message.includes("Not authorized") ? "permission" : "failed" },
      { status: error.message.includes("Not authorized") ? 403 : 400 },
    );
  if (!dryRun) revalidatePath(`/${locale}/app`, "layout");
  return Response.json(data);
}
