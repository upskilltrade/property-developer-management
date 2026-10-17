"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, str } from "@/lib/form";

export async function login(fd: FormData) {
  const locale = formLocale(fd);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(fd, "email"),
    password: String(fd.get("password") ?? ""),
  });
  if (error) redirect(`/${locale}/login?error=invalid`);
  redirect(`/${locale}/workspace`);
}

export async function logout(fd: FormData) {
  const locale = formLocale(fd);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
