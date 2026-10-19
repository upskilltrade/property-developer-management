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

const internalRoles = new Set([
  "OWNER",
  "PROJECT_MANAGER",
  "FINANCE_MANAGER",
  "ACCOUNTANT",
  "QS_COST_CONTROL",
  "SITE_ENGINEER",
  "PROCUREMENT",
  "SALES",
  "CRM",
]);

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
    isInternal: [...roles].some((r) => internalRoles.has(r)),
    ownerOrganizationId: ownerGrant?.organization_id ?? null,
  };
});
