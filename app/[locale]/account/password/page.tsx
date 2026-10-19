import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { MIN_PASSWORD } from "@/lib/supabase/admin";
import { Field, Hidden, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { changePassword } from "./actions";
import { logout } from "../../login/actions";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const p = t.password;
  const forced = Boolean(user.app_metadata?.must_change_password);
  const message = error ? (p.errors[error as keyof typeof p.errors] ?? p.errors.failed) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-md bg-brand/10 text-brand">
            <KeyRound className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{p.title}</h1>
            <p className="text-2xs text-muted">{user.email}</p>
          </div>
        </div>
        <p className="mb-4 text-[13px] text-muted">{forced ? p.forced : p.body}</p>
        {message ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <AlertTriangle className="size-4 shrink-0" />
            {message.replace("{n}", String(MIN_PASSWORD))}
          </div>
        ) : null}
        <form action={changePassword} className="space-y-4">
          <Hidden values={{ locale }} />
          <Field label={p.new} hint={p.hint.replace("{n}", String(MIN_PASSWORD))}>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              className="h-10"
            />
          </Field>
          <Field label={p.confirm}>
            <Input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
              className="h-10"
            />
          </Field>
          <SubmitButton size="md" className="h-10 w-full">
            {p.submit}
          </SubmitButton>
        </form>
        <div className="mt-4 flex justify-between text-2xs">
          {forced ? (
            <form action={logout}>
              <Hidden values={{ locale }} />
              <button type="submit" className="text-muted hover:text-ink">
                {t.common.signOut}
              </button>
            </form>
          ) : (
            <Link href={`/${locale}/workspace`} className="text-muted hover:text-ink">
              {p.back}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
