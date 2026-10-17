import type { Metadata } from "next";
import { AlertTriangle, Bell, CheckCheck, Clock, Settings2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Hidden } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { markAllRead, openNotification } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

const severityTone = { INFO: "info", WARNING: "warning", CRITICAL: "danger" } as const;

export default async function Notifications({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const { supabase } = await getSession(locale);
  const n = t.notifications;
  const base = `/${locale}/app/notifications`;

  let query = supabase
    .from("notifications")
    .select("id,kind,severity,title_th,title_en,body_th,body_en,link,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (unreadOnly) query = query.is("read_at", null);
  const [{ data: rows }, { count: unread }] = await Promise.all([
    query,
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const items = rows ?? [];
  const th = locale === "th";

  return (
    <>
      <PageHeader
        title={n.title}
        subtitle={n.subtitle}
        actions={
          <>
            {unread ? (
              <form action={markAllRead}>
                <Hidden values={{ locale }} />
                <SubmitButton variant="secondary" size="sm">
                  <CheckCheck />
                  {n.markAllRead}
                </SubmitButton>
              </form>
            ) : null}
            <ButtonLink href={`/${locale}/app/settings/notifications`} variant="ghost" size="sm">
              <Settings2 />
              {t.nav.notificationSettings}
            </ButtonLink>
          </>
        }
      />
      <div className="mb-4">
        <Tabs
          active={unreadOnly ? "unread" : "all"}
          items={[
            { key: "all", label: n.all, href: base },
            {
              key: "unread",
              label: n.unreadOnly,
              href: `${base}?filter=unread`,
              count: unread ?? 0,
            },
          ]}
        />
      </div>
      <Panel>
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const sev = (item.severity as keyof typeof severityTone) ?? "INFO";
              const Icon = sev === "CRITICAL" ? AlertTriangle : sev === "WARNING" ? Clock : Bell;
              return (
                <li key={item.id}>
                  <form action={openNotification}>
                    <Hidden values={{ locale, id: item.id, link: item.link ?? "" }} />
                    <button
                      type="submit"
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-subtle",
                        !item.read_at && "bg-brand/[0.04]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          sev === "CRITICAL"
                            ? "text-red-600"
                            : sev === "WARNING"
                              ? "text-amber-500"
                              : "text-brand",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-[13px]",
                            item.read_at ? "text-ink-2" : "font-semibold text-ink",
                          )}
                        >
                          {th ? item.title_th : item.title_en}
                        </span>
                        {(th ? item.body_th : item.body_en) ? (
                          <span className="block text-2xs whitespace-pre-line text-muted">
                            {th ? item.body_th : item.body_en}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-[10px] text-faint">
                          {formatDateTime(locale, item.created_at)}
                        </span>
                      </span>
                      {sev !== "INFO" ? (
                        <Badge tone={severityTone[sev]}>{n.severity[sev]}</Badge>
                      ) : null}
                      {!item.read_at ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                      ) : null}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Bell />} title={unreadOnly ? n.emptyUnread : n.empty} />
        )}
      </Panel>
    </>
  );
}
