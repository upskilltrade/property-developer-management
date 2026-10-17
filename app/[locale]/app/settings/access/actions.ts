"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { formLocale, str, withFlash } from "@/lib/form";

async function ownerContext(locale: Locale) {
  const back = `/${locale}/app/settings/access`;
  const { supabase, ownerOrganizationId } = await getSession(locale);
  if (!ownerOrganizationId) redirect(`/${locale}/app/access-denied`);
  const fail = (key: string): never => redirect(withFlash(back, "error", key));
  const done = (key: string): never => {
    revalidatePath(back);
    redirect(withFlash(back, "saved", key));
  };
  return { supabase, org: ownerOrganizationId, fail, done };
}

/** Reads scope_type / scope_id; a PROJECT scope must name a project. */
function readScope(fd: FormData) {
  const scope = str(fd, "scope_type") === "ORGANIZATION" ? "ORGANIZATION" : "PROJECT";
  const scopeId = scope === "ORGANIZATION" ? null : str(fd, "scope_id");
  return { scope, scopeId, valid: scope === "ORGANIZATION" || Boolean(scopeId) };
}

/** "MODULE:ACTION" from the permission catalog. */
function parsePermission(value: string) {
  const [module_code, action_code, ...rest] = value.split(":");
  return module_code && action_code && !rest.length ? { module_code, action_code } : null;
}

export async function assignAccess(fd: FormData) {
  const { supabase, fail, done } = await ownerContext(formLocale(fd));
  const membershipId = str(fd, "membership_id");
  const roleId = str(fd, "role_id");
  const { scope, scopeId, valid } = readScope(fd);
  if (!membershipId || !roleId || !valid) fail("invalid");

  const { error } = await supabase
    .from("membership_roles")
    .insert({ membership_id: membershipId, role_id: roleId, scope_type: scope, scope_id: scopeId });
  if (error) fail("assign");
  done("assign");
}

export async function createRole(fd: FormData) {
  const { supabase, org, fail, done } = await ownerContext(formLocale(fd));
  const suffix = str(fd, "code")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  const nameTh = str(fd, "name_th");
  const nameEn = str(fd, "name_en");
  if (!suffix || !nameTh || !nameEn) fail("invalid");

  const { data: role, error } = await supabase
    .from("roles")
    .insert({
      organization_id: org,
      code: `CUSTOM_${suffix}`,
      name_th: nameTh,
      name_en: nameEn,
      description: str(fd, "description") || null,
      is_system: false,
      is_template: false,
    })
    .select("id")
    .single();
  if (error || !role) fail("role");

  const permissions = fd
    .getAll("permission")
    .map((v) => parsePermission(String(v)))
    .filter((p) => p !== null)
    .map((p) => ({ role_id: role!.id, ...p }));
  if (permissions.length) {
    const { error: permError } = await supabase.from("role_permissions").insert(permissions);
    if (permError) fail("role_permissions");
  }
  done("role");
}

export async function setOverride(fd: FormData) {
  const { supabase, fail, done } = await ownerContext(formLocale(fd));
  const membershipId = str(fd, "membership_id");
  const permission = parsePermission(str(fd, "permission"));
  const effect = str(fd, "effect");
  const { scope, scopeId, valid } = readScope(fd);
  if (!membershipId || !permission || !["ALLOW", "DENY"].includes(effect) || !valid)
    fail("invalid");

  const { error } = await supabase.from("membership_permission_overrides").insert({
    membership_id: membershipId,
    ...permission!,
    effect,
    scope_type: scope,
    scope_id: scopeId,
  });
  if (error) fail("override");
  done("override");
}
