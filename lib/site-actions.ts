import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formLocale, str, withFlash } from "@/lib/form";
import { siteErrorKey } from "@/lib/site";

/** Shared server-action context: session, safe return path and flash redirect. */
export async function siteContext(fd: FormData, allowedPrefix: (locale: string) => string) {
  const locale = formLocale(fd);
  const fallback = allowedPrefix(locale);
  const requested = str(fd, "return_to");
  const back = requested.startsWith(fallback) ? requested : fallback;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const finish = (error: { message?: string } | null, key: string, to = back): never => {
    if (error) redirect(withFlash(back, "error", siteErrorKey(error.message)));
    revalidatePath(`/${locale}/app`, "layout");
    redirect(withFlash(to, "saved", key));
  };
  return { locale, supabase, back, finish };
}
