"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { code, formLocale, optStr, str, withFlash } from "@/lib/form";
import { projectStatuses } from "@/lib/status";

const validStatus = (s: string) => (projectStatuses as readonly string[]).includes(s);

export async function createProject(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/projects`;
  const name = str(fd, "name");
  const projectCode = code(fd, "code");
  const status = str(fd, "status") || "PLANNING";
  if (!name || !projectCode || !validStatus(status)) redirect(withFlash(back, "error", "invalid"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect(withFlash(back, "error", "permission"));

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      organization_id: membership.organization_id,
      code: projectCode,
      name,
      status,
      default_locale: locale,
      timezone: "Asia/Bangkok",
      currency_code: "THB",
      target_completion_date: optStr(fd, "target_completion_date"),
    })
    .select("id")
    .single();
  if (error || !created) redirect(withFlash(back, "error", "create"));
  revalidatePath(`/${locale}/app`, "layout");
  redirect(withFlash(`${back}/${created.id}/setup`, "saved", "project"));
}

export async function updateProject(fd: FormData) {
  const locale = formLocale(fd);
  const id = str(fd, "id");
  const back = `/${locale}/app/projects/${id}`;
  const name = str(fd, "name");
  const projectCode = code(fd, "code");
  const status = str(fd, "status");
  if (!id || !name || !projectCode || !validStatus(status))
    redirect(withFlash(back, "error", "invalid"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      code: projectCode,
      name,
      status,
      target_completion_date: optStr(fd, "target_completion_date"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) redirect(withFlash(back, "error", "update"));
  revalidatePath(`/${locale}/app`, "layout");
  redirect(withFlash(back, "saved", "project"));
}
