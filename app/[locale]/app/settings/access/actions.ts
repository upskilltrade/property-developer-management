"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/config";
import { formLocale, str, withFlash } from "@/lib/form";
import { canManageLogins, createAdminClient, MIN_PASSWORD } from "@/lib/supabase/admin";

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

/**
 * Owner/Admin adds a user: creates the login with the password they set (no email needed),
 * then attaches the membership and role. The user must change the password on first sign-in.
 * An email that already has a login is added as-is; its password is left unchanged.
 */
export async function createMember(fd: FormData) {
  const { supabase, org, fail, done } = await ownerContext(formLocale(fd));
  if (!canManageLogins()) fail("loginsOff");
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const name = str(fd, "display_name");
  const roleId = str(fd, "role_id");
  const { scope, scopeId, valid } = readScope(fd);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !roleId || !valid) fail("invalid");

  const { data: existing, error: lookupError } = await supabase.rpc("account_for_email", {
    target_org: org,
    account_email: email,
  });
  if (lookupError) fail("permission");
  const admin = createAdminClient();
  let userId = existing as string | null;
  let created = false;
  if (!userId) {
    if (password.length < MIN_PASSWORD) fail("passwordShort");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name },
      app_metadata: { must_change_password: true },
    });
    if (error || !data.user)
      fail(error?.message.includes("Password") ? "passwordWeak" : "createUser");
    userId = data.user!.id;
    created = true;
  }

  const { error } = await supabase.rpc("add_member", {
    target_org: org,
    target_user: userId,
    display_name: name,
    target_role: roleId,
    scope_type: scope,
    scope_id: scopeId,
  });
  if (error) {
    // Don't leave a login behind that nobody can use.
    if (created) await admin.auth.admin.deleteUser(userId!);
    fail("assign");
  }
  done(created ? "memberCreated" : "memberAdded");
}

/** Owner/Admin sets a new password for a member (forgotten password); they must change it again. */
export async function resetMemberPassword(fd: FormData) {
  const { supabase, org, fail, done } = await ownerContext(formLocale(fd));
  if (!canManageLogins()) fail("loginsOff");
  const userId = str(fd, "user_id");
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) fail("passwordShort");
  // Only members of this organization, checked as the signed-in owner.
  const { data: members, error: dirError } = await supabase.rpc("member_directory", {
    target_org: org,
  });
  if (dirError || !(members ?? []).some((m: { user_id: string }) => m.user_id === userId))
    fail("permission");
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    password,
    app_metadata: { must_change_password: true },
  });
  if (error) fail(error.message.includes("Password") ? "passwordWeak" : "createUser");
  done("passwordReset");
}

export async function setMemberStatus(fd: FormData) {
  const { supabase, fail, done } = await ownerContext(formLocale(fd));
  const { error } = await supabase.rpc("set_member_status", {
    target_membership: str(fd, "membership_id"),
    new_status: str(fd, "status"),
  });
  if (error) fail(error.message.includes("own access") ? "selfAccess" : "assign");
  done("memberStatus");
}
