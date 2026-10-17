import { CalendarCheck, Home, Images } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, toNumber } from "@/lib/format";
import { scheduleStages } from "@/lib/schedule";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";
import { PhotoThumb } from "@/components/domain/photo-thumb";
import { CustomerPayments, type CustomerUnitPayments } from "@/components/domain/customer-payments";
import { submitPaymentEvidence } from "./actions";

type Named = { name_th: string; name_en: string };
type PortalUnit = {
  unit_id: string;
  unit_code: string;
  unit_name: string | null;
  project_name: string;
  progress: number | string;
  handover: string | null;
  activities: (Named & {
    code: string;
    stage: string;
    weight: number;
    is_milestone: boolean;
    percent: number;
  })[];
  updates: (Named & { id: string; date: string; percent: number; stage: string })[];
  photos: (Named & {
    id: string;
    path: string;
    thumb: string | null;
    caption: string | null;
    taken_at: string;
  })[];
};

/** Customer view: only published, verified progress and photos of the customer's own units. */
export default async function CustomerPortal({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase } = await getSession(locale);
  const c = t.portal.customer;
  const [{ data }, { data: paymentData }] = await Promise.all([
    supabase.rpc("get_customer_portal"),
    supabase.rpc("get_customer_payments"),
  ]);
  const paymentsByUnit = new Map(
    ((paymentData ?? []) as CustomerUnitPayments[]).map((x) => [x.unit_id, x]),
  );
  const units = (data ?? []) as PortalUnit[];

  if (!units.length) {
    return (
      <PortalPlaceholder
        icon={<Home />}
        title={c.title}
        body={c.body}
        tone="brand"
        homeHref={`/${locale}/workspace`}
        homeLabel={t.portal.goHome}
      />
    );
  }

  const paths = units.flatMap((u) =>
    u.photos.flatMap((p) => [p.path, p.thumb].filter(Boolean) as string[]),
  );
  const { data: signed } = paths.length
    ? await supabase.storage.from("site-photos").createSignedUrls(paths, 3600)
    : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const name = (x: Named) => (locale === "th" ? x.name_th : x.name_en) || x.name_en;
  const date = (v: string | null | undefined) => formatDate(locale, v);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {units.map((u) => {
        const stages = scheduleStages
          .map((stage) => {
            const acts = u.activities.filter((a) => a.stage === stage && !a.is_milestone);
            const w = acts.reduce((s, a) => s + toNumber(a.weight), 0);
            return {
              stage,
              pct: w
                ? acts.reduce((s, a) => s + toNumber(a.weight) * toNumber(a.percent), 0) / w
                : null,
            };
          })
          .filter((s) => s.pct != null);
        return (
          <section key={u.unit_id} className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-5 shadow-xs">
              <p className="text-2xs font-medium tracking-wide text-muted uppercase">
                {u.project_name}
              </p>
              <h1 className="text-xl font-semibold">
                {u.unit_code}
                {u.unit_name ? (
                  <span className="ml-2 text-[14px] font-normal text-muted">{u.unit_name}</span>
                ) : null}
              </h1>
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className="text-[13px] font-medium">{c.progress}</p>
                  <p className="mb-2 text-2xs text-muted">{c.progressHint}</p>
                  <div className="flex items-center gap-3">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, toNumber(u.progress))}%` }}
                      />
                    </div>
                    <span className="text-2xl font-semibold num">
                      {toNumber(u.progress).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {u.handover ? (
                  <div className="rounded-md bg-subtle px-3 py-2 text-right">
                    <p className="flex items-center justify-end gap-1 text-2xs text-muted">
                      <CalendarCheck className="size-3.5" />
                      {c.handover}
                    </p>
                    <p className="text-[15px] font-semibold">{date(u.handover)}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <CustomerPayments
              data={paymentsByUnit.get(u.unit_id)}
              locale={locale}
              t={t}
              action={submitPaymentEvidence}
            />

            <Panel title={c.stages}>
              <ol className="divide-y divide-line">
                {stages.map((s) => (
                  <li
                    key={s.stage}
                    className="grid grid-cols-[8rem_1fr] items-center gap-3 px-4 py-2.5 text-[13px]"
                  >
                    <span className={cn("font-medium", s.pct! >= 100 && "text-emerald-700")}>
                      {label(t.status.stage, s.stage)}
                    </span>
                    <Progress value={s.pct!} />
                  </li>
                ))}
              </ol>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title={c.updates}>
                {u.updates.length ? (
                  <ul className="divide-y divide-line">
                    {u.updates.slice(0, 12).map((x) => (
                      <li
                        key={x.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{name(x)}</p>
                          <p className="text-2xs text-muted">{date(x.date)}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-semibold num",
                            toNumber(x.percent) >= 100 ? "text-emerald-700" : "text-brand",
                          )}
                        >
                          {toNumber(x.percent)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={<CalendarCheck />} title={c.noUpdates} />
                )}
              </Panel>
              <Panel title={c.photos}>
                {u.photos.length ? (
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {u.photos.slice(0, 24).map((p) => (
                      <PhotoThumb
                        key={p.id}
                        full={url.get(p.path) ?? ""}
                        thumb={url.get(p.thumb ?? p.path) ?? url.get(p.path) ?? ""}
                        caption={p.caption ?? name(p)}
                        meta={date(p.taken_at)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Images />} title={c.noPhotos} />
                )}
              </Panel>
            </div>
          </section>
        );
      })}
    </div>
  );
}
