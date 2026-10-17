import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { Field, Hidden, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { error } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-nav p-10 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-brand text-xs font-bold">
            DP
          </div>
          <span className="font-semibold tracking-tight">{t.app.name}</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">
            {t.auth.heroTitle}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{t.auth.heroBody}</p>
          <ul className="mt-8 space-y-2.5">
            {t.auth.heroPoints.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm text-slate-200">
                <CheckCircle2 className="size-4 text-blue-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-2xs text-slate-500">{t.app.tagline}</p>
      </section>

      <section className="flex flex-col bg-surface">
        <div className="flex justify-end gap-1 p-4 text-2xs font-semibold">
          {(["th", "en"] as const).map((l) => (
            <Link
              key={l}
              href={`/${l}/login`}
              className={cn(
                "rounded px-2 py-1 uppercase",
                l === locale ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="grid size-8 place-items-center rounded-md bg-brand text-xs font-bold text-white">
                DP
              </div>
              <span className="font-semibold">{t.app.name}</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">{t.auth.title}</h2>
            <p className="mt-1 text-[13px] text-muted">{t.auth.subtitle}</p>

            {error ? (
              <div className="mt-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                <AlertTriangle className="size-4 shrink-0" />
                {t.auth.invalid}
              </div>
            ) : null}

            <form action={login} className="mt-6 space-y-4">
              <Hidden values={{ locale }} />
              <Field label={t.auth.email}>
                <Input name="email" type="email" autoComplete="email" required className="h-10" />
              </Field>
              <Field label={t.auth.password}>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-10"
                />
              </Field>
              <SubmitButton size="md" className="h-10 w-full">
                {t.auth.submit}
              </SubmitButton>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
