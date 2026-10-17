"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formLocale, str, withFlash } from "@/lib/form";

/** Only in-app paths are followed, so a stored link can never send someone off-site. */
const safeLink = (link: string) =>
  /^\/app\/[\w\-/?=&.]*$/.test(link) ? link : "/app/notifications";

export async function openNotification(fd: FormData) {
  const locale = formLocale(fd);
  const { supabase } = await getSession(locale);
  const id = str(fd, "id");
  if (id) await supabase.rpc("mark_notifications_read", { target_ids: [id] });
  revalidatePath(`/${locale}/app`, "layout");
  redirect(`/${locale}${safeLink(str(fd, "link"))}`);
}

export async function markAllRead(fd: FormData) {
  const locale = formLocale(fd);
  const { supabase } = await getSession(locale);
  await supabase.rpc("mark_notifications_read", { target_ids: null });
  revalidatePath(`/${locale}/app`, "layout");
  redirect(`/${locale}/app/notifications`);
}

export async function savePreferences(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/settings/notifications`;
  const { supabase } = await getSession(locale);
  const lineOn = fd.get("line_enabled") === "on";
  const lineId = str(fd, "line_user_id");
  if (lineOn && !lineId) redirect(withFlash(back, "error", "lineIdRequired"));
  const { error } = await supabase.rpc("save_notification_preferences", {
    email_on: fd.get("email_enabled") === "on",
    line_on: lineOn,
    line_id: lineId,
    digest_on: fd.get("digest_enabled") === "on",
  });
  if (error) redirect(withFlash(back, "error", "error"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "1"));
}

export async function rotateCalendar(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/settings/notifications`;
  const { supabase } = await getSession(locale);
  const { error } = await supabase.rpc("rotate_calendar_token");
  if (error) redirect(withFlash(back, "error", "error"));
  revalidatePath(back);
  redirect(withFlash(back, "saved", "1"));
}

export async function runAutomationNow(fd: FormData) {
  const locale = formLocale(fd);
  const back = `/${locale}/app/settings/notifications`;
  const { supabase } = await getSession(locale);
  const { data, error } = await supabase.rpc("run_automation_now");
  if (error) redirect(withFlash(back, "error", "permission"));
  revalidatePath(`/${locale}/app`, "layout");
  redirect(`${back}?ran=${Number(data) || 0}`);
}
