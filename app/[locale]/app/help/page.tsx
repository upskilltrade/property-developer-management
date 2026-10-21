import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Printer } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { groupManual, manualFor } from "@/lib/manual";
import { ManualMarkdown } from "@/lib/manual/markdown";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "User manual" };

/** In-app user manual (Thai): chapters for the signed-in user's roles; ?all=1 shows everything to print. */
export default async function HelpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ s?: string; all?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { s, all } = await searchParams;
  const { roles } = await getSession(locale);
  const h = t.help;
  const sections = manualFor(roles);
  const groups = groupManual(sections);
  const base = `/${locale}/app/help`;
  const current = sections.find((x) => x.id === s) ?? sections[0];
  const shown = all ? sections : current ? [current] : [];

  return (
    <>
      <PageHeader
        title={h.title}
        subtitle={h.subtitle}
        crumbs={[{ label: t.nav.dashboard, href: `/${locale}/app` }, { label: h.title }]}
        actions={
          <Link href={`${base}?all=1`} className={buttonClass("secondary")}>
            <Printer />
            {h.printAll}
          </Link>
        }
      />
      {sections.length ? (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <nav className="space-y-4 print:hidden lg:sticky lg:top-4 lg:self-start">
            {groups.map((g) => (
              <div key={g.group}>
                <p className="mb-1 px-2 text-2xs font-semibold tracking-wide text-faint uppercase">
                  {g.group}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((x) => (
                    <li key={x.id}>
                      <Link
                        href={`${base}?s=${x.id}`}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-[13px] hover:bg-subtle",
                          !all && x.id === current?.id
                            ? "bg-brand/10 font-medium text-brand"
                            : "text-ink-2",
                        )}
                      >
                        {x.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {locale !== "th" ? <p className="px-2 text-2xs text-muted">{h.thaiOnly}</p> : null}
          </nav>
          <div className="min-w-0 space-y-4">
            {shown.map((x) => (
              <Panel key={x.id} title={x.title} description={x.group} className="break-inside-avoid-page">
                <article className="px-5 py-4">
                  <ManualMarkdown source={x.body} />
                </article>
              </Panel>
            ))}
            {all ? <p className="text-2xs text-muted print:hidden">{h.printHint}</p> : null}
          </div>
        </div>
      ) : (
        <EmptyState icon={<BookOpen />} title={h.empty} />
      )}
    </>
  );
}
