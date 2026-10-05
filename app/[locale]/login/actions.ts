"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "th";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/${locale}/login?error=invalid`);
  redirect(`/${locale}/app`);
}

export async function logout(formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "th";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/login`);
}
