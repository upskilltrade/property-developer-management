import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n/config";

export type AccessGrant = {
  organization_id: string;
  role_code: string;
  scope_type: "ORGANIZATION" | "PROJECT" | string;
  scope_id: string | null;
};

/**
 * Roles for people outside the company. Every other role, including custom CUSTOM_* roles, is
 * internal staff; the database draws the same line (can_access_project, is_internal_member).
 */
export const externalRoles = new Set(["CUSTOMER", "CONTRACTOR", "INVESTOR"]);

/** Roles that may manage organisation setup (projects, units, plots); mirrors can_manage_organization. */
const managerRoles = new Set(["OWNER", "FINANCE_MANAGER"]);

/** Per-request session: the signed-in user plus their role grants. Redirects to login when signed out. */
export const getSession = cache(async (locale: Locale) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  // Logins an owner created start with a password the user must replace before using the app.
  if (user.app_metadata?.must_change_password) redirect(`/${locale}/account/password`);

  const [{ data: grants }, { data: profile }] = await Promise.all([
    supabase.rpc("current_access_profile"),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const access = (grants ?? []) as AccessGrant[];
  const roles = new Set(access.map((g) => g.role_code));
  const ownerGrant = access.find((g) => g.role_code === "OWNER" && g.scope_type === "ORGANIZATION");

  return {
    supabase,
    user,
    displayName: profile?.display_name || user.email?.split("@")[0] || "User",
    access,
    roles,
    isInternal: [...roles].some((r) => !externalRoles.has(r)),
    canManageOrganization: access.some(
      (g) => managerRoles.has(g.role_code) && g.scope_type === "ORGANIZATION",
    ),
    ownerOrganizationId: ownerGrant?.organization_id ?? null,
  };
});

/** Session for staff-only pages: customers, contractors and investors go to the access-denied page. */
export async function getStaffSession(locale: Locale) {
  const session = await getSession(locale);
  if (!session.isInternal) redirect(`/${locale}/app/access-denied`);
  return session;
}
