"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formLocale, str, withFlash } from "@/lib/form";

export async function assignAccess(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/settings/access`;
  const { supabase, ownerOrganizationId } = await getSession(locale);
  if (!ownerOrganizationId) redirect(`/${locale}/app/access-denied`);

  const membershipId = str(fd, "membership_id");
  const roleId = str(fd, "role_id");
  const scope = str(fd, "scope_type") === "ORGANIZATION" ? "ORGANIZATION" : "PROJECT";
  const scopeId = scope === "ORGANIZATION" ? null : str(fd, "scope_id");
  if (!membershipId || !roleId || (scope === "PROJECT" && !scopeId))
    redirect(withFlash(back, "error", "invalid"));

  const { error } = await supabase
    .from("membership_roles")
    .insert({ membership_id: membershipId, role_id: roleId, scope_type: scope, scope_id: scopeId });
  if (error) redirect(withFlash(back, "error", "assign"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "assign"));
}
