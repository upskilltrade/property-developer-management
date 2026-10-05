"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const statuses = new Set(["PLANNING","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"]);

export async function createProject(formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "th";
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const status = String(formData.get("status") ?? "PLANNING");
  const target = String(formData.get("target_completion_date") ?? "").trim();
  if (!name || !code || !statuses.has(status)) redirect(`/${locale}/app/projects?error=invalid`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect(`/${locale}/app/projects?error=permission`);

  const { error } = await supabase.from("projects").insert({
    organization_id: membership.organization_id, code, name, status,
    default_locale: locale, timezone: "Asia/Bangkok", currency_code: "THB",
    target_completion_date: target || null,
  });
  if (error) redirect(`/${locale}/app/projects?error=create`);
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/projects`);
  redirect(`/${locale}/app/projects?created=1`);
}

export async function updateProject(formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "th";
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const status = String(formData.get("status") ?? "");
  const target = String(formData.get("target_completion_date") ?? "").trim();
  if (!id || !name || !code || !statuses.has(status)) redirect(`/${locale}/app/projects?error=invalid`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { error } = await supabase.from("projects").update({
    code, name, status, target_completion_date: target || null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) redirect(`/${locale}/app/projects?error=update`);
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/projects`);
  redirect(`/${locale}/app/projects?updated=1`);
}
