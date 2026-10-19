"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale } from "@/lib/form";
import { canManageLogins, createAdminClient, MIN_PASSWORD } from "@/lib/supabase/admin";

/** The signed-in user sets their own password; clears the "must change" flag an admin set. */
export async function changePassword(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/account/password`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) redirect(`${back}?error=short`);
  if (password !== String(fd.get("confirm") ?? "")) redirect(`${back}?error=mismatch`);

  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    redirect(
      `${back}?error=${error.code === "same_password" ? "same" : error.code === "weak_password" ? "weak" : "failed"}`,
    );
  if (user.app_metadata?.must_change_password && canManageLogins()) {
    await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: { must_change_password: false },
    });
    await supabase.auth.refreshSession();
  }
  redirect(`/${locale}/workspace`);
}
