import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarRange, CheckCircle2, ClipboardCheck, Images, Send } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, toNumber } from "@/lib/format";
import {
  activityColumns,
  activityName,
  delayDays,
  plannedProgress,
  scheduleState,
  statusTone,
  todayIso,
  weightedProgress,
  type Activity,
} from "@/lib/schedule";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { Gantt } from "@/components/domain/gantt";
import { ReportProgressForm } from "@/components/domain/report-progress-form";
import { PhotoThumb } from "@/components/domain/photo-thumb";
import { AiPhotoReview, type PhotoReviewRow } from "@/components/domain/ai-photo-review";
import {
  applyScheduleTemplate,
  publishProgress,
  reportProgress,
  reviewPhotosWithAi,
  updateForecast,
  verifyProgress,
} from "../../../schedule/actions";

export const metadata: Metadata = { title: "House schedule" };

type Update = {
  id: string;
  activity_id: string;
  report_date: string;
  reported_percent: number | string;
  reported_by: string | null;
  note: string | null;
  verified_percent: number | string | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  publication_status: string;
  created_at: string;
  reporter: { display_name: string | null } | { display_name: string | null }[] | null;
  verifier: { display_name: string | null } | { display_name: string | null }[] | null;
};

type Photo = {
  id: string;
  activity_id: string;
  progress_update_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  taken_at: string | null;
  uploaded_at: string;
  publication_status: string;
};

const nameOf = (p: Update["reporter"]) => (Array.isArray(p) ? p[0] : p)?.display_name ?? null;

export default async function UnitSchedule({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
  searchParams: Promise<{ zoom?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, unitId } = await params;
  const zoom = (await searchParams).zoom === "week" ? "week" : "month";
  const { supabase, user } = await getSession(locale);
  const s = t.schedule;

  const { data: unit } = await supabase
    .from("units")
    .select("id,code,name,project_id,projects(organization_id)")
    .eq("id", unitId)
    .eq("project_id", id)
    .maybeSingle();
  if (!unit) notFound();
  const project = Array.isArray(unit.projects) ? unit.projects[0] : unit.projects;
  const orgId = project?.organization_id as string;

  const [
    { data: actRows },
    { data: updateRows },
    { data: photoRows },
    { data: templates },
    { data: canApprove },
    { data: canReport },
    { data: reviewRows },
  ] = await Promise.all([
    supabase
      .from("schedule_activities")
      .select(activityColumns)
      .eq("unit_id", unitId)
      .order("sequence"),
    supabase
      .from("progress_updates")
      .select(
        "id,activity_id,report_date,reported_percent,reported_by,note,verified_percent,verified_by,verified_at,verification_note,publication_status,created_at,reporter:profiles!progress_updates_reported_by_fkey(display_name),verifier:profiles!progress_updates_verified_by_fkey(display_name)",
      )
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("activity_photos")
      .select(
        "id,activity_id,progress_update_id,storage_path,thumbnail_path,caption,taken_at,uploaded_at,publication_status",
      )
      .eq("unit_id", unitId)
      .is("voided_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(500),
    supabase
      .from("schedule_templates")
      .select("id,code,name_th,name_en")
      .eq("active", true)
      .order("code"),
    supabase.rpc("can_schedule", { target_project: id, target_action: "APPROVE" }),
    supabase.rpc("can_report_progress", { target_project: id }),
    supabase
      .from("ai_photo_reviews")
      .select(
        "progress_update_id,verdict,estimated_percent,summary_th,summary_en,concerns,photo_count,created_at,spec_verdict,technical_verdict,findings,documents",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  // Latest AI review per progress update.
  const reviewByUpdate = new Map<string, PhotoReviewRow>();
  for (const r of (reviewRows ?? []) as (PhotoReviewRow & { progress_update_id: string })[])
    if (!reviewByUpdate.has(r.progress_update_id)) reviewByUpdate.set(r.progress_update_id, r);

  const acts = (actRows ?? []) as Activity[];
  const updates = (updateRows ?? []) as unknown as Update[];
  const photos = (photoRows ?? []) as Photo[];
  const today = todayIso();
  const base = `/${locale}/app/projects/${id}/units/${unitId}/schedule`;
  const hidden = { locale, project_id: id, unit_id: unitId, return_to: base };

  // Signed URLs for every thumbnail and full image shown on this page (1 hour).
  const paths = photos.flatMap(
    (p) => [p.storage_path, p.thumbnail_path].filter(Boolean) as string[],
  );
  const { data: signed } = paths.length
    ? await supabase.storage.from("site-photos").createSignedUrls(paths, 3600)
    : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const photoUrl = (p: Photo) => ({
    full: url.get(p.storage_path) ?? "",
    thumb: url.get(p.thumbnail_path ?? p.storage_path) ?? url.get(p.storage_path) ?? "",
  });
  const photosByUpdate = new Map<string, Photo[]>();
  const photosByActivity = new Map<string, Photo[]>();
  for (const p of photos) {
    if (p.progress_update_id)
      photosByUpdate.set(p.progress_update_id, [
        ...(photosByUpdate.get(p.progress_update_id) ?? []),
        p,
      ]);
    photosByActivity.set(p.activity_id, [...(photosByActivity.get(p.activity_id) ?? []), p]);
  }
  const pendingFor = (a: Activity) => updates.find((u) => u.activity_id === a.id && !u.verified_at);
  const publishableFor = (a: Activity) =>
    updates.find(
      (u) => u.activity_id === a.id && u.verified_at && u.publication_status !== "PUBLISHED",
    );

  const work = acts.filter((a) => !a.is_milestone);
  const progress = weightedProgress(work);
  const planned = plannedProgress(work, today);
  const lateCount = work.filter((a) => {
    const st = scheduleState(a, today);
    return !st.done && (st.late || st.overdue);
  }).length;
  const forecastFinish = acts.reduce<string | null>(
    (m, a) => (a.forecast_finish && (!m || a.forecast_finish > m) ? a.forecast_finish : m),
    null,
  );
  const baselineFinish = acts.reduce<string | null>(
    (m, a) => (a.baseline_finish && (!m || a.baseline_finish > m) ? a.baseline_finish : m),
    null,
  );
  const unitDelay = Math.max(0, ...acts.map((a) => delayDays(a, today)));
  const pendingCount = updates.filter((u) => !u.verified_at).length;
  const actName = new Map(acts.map((a) => [a.id, `${a.code} · ${activityName(a, locale)}`]));
  const date = (v: string | null | undefined) => formatDate(locale, v);

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={`/${locale}/app/projects/${id}/units/${unitId}`}
        className="grid size-8 place-items-center rounded-md border border-line bg-surface text-muted hover:text-ink"
        aria-label={t.common.back}
      >
        <ArrowLeft className="size-4" />
      </Link>
      <div>
        <p className="text-2xs font-medium tracking-wide text-muted uppercase">{s.unitTitle}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{unit.code}</h2>
          {unit.name ? <span className="text-[13px] text-muted">{unit.name}</span> : null}
        </div>
      </div>
    </div>
  );

  if (!acts.length) {
    return (
      <div className="space-y-4">
        {header}
        <Panel>
          <EmptyState icon={<CalendarRange />} title={s.noSchedule} body={s.noScheduleBody} />
          {canApprove ? (
            <form
              action={applyScheduleTemplate}
              className="mx-auto mb-6 grid max-w-md gap-3 px-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
            >
              <Hidden values={hidden} />
              <Field label={s.template}>
                <Select name="template_id" required defaultValue={templates?.[0]?.id ?? ""}>
                  {(templates ?? []).map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {locale === "th" ? tp.name_th : tp.name_en}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={s.startDate}>
                <Input name="start_date" type="date" defaultValue={today} required />
              </Field>
              <SubmitButton>{s.applyTemplate}</SubmitButton>
            </form>
          ) : null}
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <KpiStrip cols={5}>
        <Kpi
          label={s.kpi.progress}
          value={`${progress.toFixed(1)}%`}
          sub={`${s.kpi.planned} ${planned.toFixed(0)}%`}
          tone={progress + 5 < planned ? "negative" : "positive"}
        />
        <Kpi
          label={s.kpi.forecast}
          value={date(forecastFinish)}
          sub={`${s.kpi.baselineFinish} ${date(baselineFinish)}`}
          tone={unitDelay > 0 ? "negative" : "default"}
        />
        <Kpi
          label={s.delay}
          value={unitDelay ? `+${unitDelay} ${s.days}` : "—"}
          tone={unitDelay > 0 ? "negative" : "positive"}
        />
        <Kpi label={s.kpi.late} value={lateCount} tone={lateCount ? "negative" : "default"} />
        <Kpi
          label={s.kpi.pending}
          value={pendingCount}
          sub={`${s.kpi.photos} ${photos.length}`}
          tone={pendingCount ? "brand" : "default"}
        />
      </KpiStrip>

      <Panel title={s.unitTitle} bodyClassName="p-0">
        <Table>
          <THead>
            <tr>
              <TH>{s.cols.activity}</TH>
              <TH>{s.cols.stage}</TH>
              <TH align="right">{s.cols.weight}</TH>
              <TH>{s.cols.baseline}</TH>
              <TH>{s.cols.forecast}</TH>
              <TH>{t.common.status}</TH>
              <TH align="right">{s.cols.reported}</TH>
              <TH className="w-36">{s.cols.verified}</TH>
              <TH align="right">{s.cols.delay}</TH>
              <TH align="right">{t.common.actions}</TH>
            </tr>
          </THead>
          <tbody>
            {acts.map((a) => {
              const st = scheduleState(a, today);
              const pending = pendingFor(a);
              const publishable = publishableFor(a);
              const pendingPhotos = pending ? (photosByUpdate.get(pending.id) ?? []) : [];
              const publishPhotos = publishable ? (photosByUpdate.get(publishable.id) ?? []) : [];
              const folder = `${orgId}/${id}/${unitId}/${a.id}`;
              return (
                <TR key={a.id} className={cn(a.is_milestone && "bg-subtle/60")}>
                  <TD className="max-w-64">
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 font-mono text-2xs text-faint">{a.code}</span>
                      <span className={cn("truncate font-medium", a.is_milestone && "italic")}>
                        {a.is_milestone ? "◆ " : ""}
                        {activityName(a, locale)}
                      </span>
                    </div>
                  </TD>
                  <TD className="text-muted">{label(t.status.stage, a.stage)}</TD>
                  <TD align="right" className="num text-muted">
                    {toNumber(a.weight) || "—"}
                  </TD>
                  <TD className="text-2xs whitespace-nowrap text-muted">
                    {date(a.baseline_start)} – {date(a.baseline_finish)}
                  </TD>
                  <TD
                    className={cn(
                      "text-2xs whitespace-nowrap",
                      st.late && !st.done && "text-red-700",
                    )}
                  >
                    {date(a.actual_start ?? a.forecast_start)} –{" "}
                    {date(a.actual_finish ?? a.forecast_finish)}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(a, today)}>{label(t.status.activity, a.status)}</Badge>
                  </TD>
                  <TD align="right" className="num">
                    {pending ? (
                      <span className="font-medium text-brand">
                        {toNumber(pending.reported_percent)}%
                      </span>
                    ) : a.reported_percent != null ? (
                      <span className="text-muted">{toNumber(a.reported_percent)}%</span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    {a.is_milestone ? null : <Progress value={toNumber(a.verified_percent)} />}
                  </TD>
                  <TD
                    align="right"
                    className={cn("num", st.delay ? "font-semibold text-red-700" : "text-faint")}
                  >
                    {st.delay ? `+${st.delay}` : "—"}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      {pending ? (
                        <Sheet
                          title={`${s.verifyTitle} · ${a.code}`}
                          description={activityName(a, locale)}
                          triggerLabel={s.verify}
                          triggerIcon={<ClipboardCheck />}
                          triggerSize="xs"
                          width="lg"
                        >
                          <div className="space-y-4">
                            <div className="rounded-md border border-line p-3 text-[13px]">
                              <p>
                                <span className="text-muted">{s.cols.reported}: </span>
                                <span className="font-semibold num">
                                  {toNumber(pending.reported_percent)}%
                                </span>
                                <span className="text-muted"> · {date(pending.report_date)}</span>
                              </p>
                              <p className="text-2xs text-muted">
                                {s.reportedBy}: {nameOf(pending.reporter) ?? s.imported}
                              </p>
                              {pending.note ? <p className="mt-2">{pending.note}</p> : null}
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {pendingPhotos.map((p) => (
                                <PhotoThumb key={p.id} {...photoUrl(p)} caption={p.caption} />
                              ))}
                              {!pendingPhotos.length ? (
                                <p className="col-span-full text-2xs text-muted">{s.noPhotos}</p>
                              ) : null}
                            </div>
                            {pendingPhotos.length || reviewByUpdate.has(pending.id) ? (
                              <AiPhotoReview
                                locale={locale}
                                review={reviewByUpdate.get(pending.id) ?? null}
                                labels={t.aiReview}
                                action={reviewPhotosWithAi}
                                hidden={{ ...hidden, update_id: pending.id, return_to: base }}
                                canRun={canApprove === true && pendingPhotos.length > 0}
                              />
                            ) : null}
                            {pending.reported_by === user.id ? (
                              <p className="rounded-md bg-amber-50 px-3 py-2 text-2xs text-amber-900">
                                {s.ownReport}
                              </p>
                            ) : canApprove ? (
                              <form action={verifyProgress} className="space-y-3">
                                <Hidden values={{ ...hidden, update_id: pending.id }} />
                                <p className="text-2xs text-muted">{s.verifyHint}</p>
                                <Field label={s.verifiedPercent} required>
                                  <Input
                                    name="percent"
                                    type="number"
                                    min="0"
                                    max="100"
                                    defaultValue={toNumber(pending.reported_percent)}
                                    required
                                  />
                                </Field>
                                <Field label={s.verificationNote}>
                                  <Textarea name="note" />
                                </Field>
                                <SheetFooter>
                                  <SubmitButton variant="success">{s.verify}</SubmitButton>
                                </SheetFooter>
                              </form>
                            ) : null}
                          </div>
                        </Sheet>
                      ) : null}
                      {publishable && canApprove ? (
                        <Sheet
                          title={`${s.publish} · ${a.code}`}
                          description={s.publishHint}
                          triggerLabel={s.publishShort}
                          triggerIcon={<Send />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                          width="lg"
                        >
                          <form action={publishProgress} className="space-y-3">
                            <Hidden values={{ ...hidden, update_id: publishable.id }} />
                            <p className="text-[13px]">
                              {s.cols.verified}:{" "}
                              <span className="font-semibold num">
                                {toNumber(publishable.verified_percent)}%
                              </span>
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {publishPhotos.map((p) => (
                                <label key={p.id} className="space-y-1">
                                  <PhotoThumb {...photoUrl(p)} caption={p.caption} />
                                  <span className="flex items-center gap-1.5 text-2xs">
                                    <input
                                      type="checkbox"
                                      name="photo_id"
                                      value={p.id}
                                      defaultChecked
                                    />
                                    {s.published}
                                  </span>
                                </label>
                              ))}
                            </div>
                            <SheetFooter>
                              <SubmitButton>{s.publish}</SubmitButton>
                            </SheetFooter>
                          </form>
                        </Sheet>
                      ) : null}
                      {canReport && !a.is_milestone && !st.done ? (
                        <Sheet
                          title={`${s.report} · ${a.code}`}
                          description={activityName(a, locale)}
                          triggerLabel={s.reportShort}
                          triggerVariant="secondary"
                          triggerSize="xs"
                        >
                          <ReportProgressForm
                            action={reportProgress}
                            hidden={{ ...hidden, activity_id: a.id }}
                            folder={folder}
                            photosRequired={a.photos_required}
                            defaultPercent={toNumber(
                              pending?.reported_percent ?? a.verified_percent,
                            )}
                            defaultDate={today}
                            labels={{
                              percent: s.percent,
                              reportDate: s.reportDate,
                              note: s.note,
                              photosLabel: s.photosLabel,
                              addPhotos: s.addPhotos,
                              uploading: s.uploading,
                              uploadFailed: s.uploadFailed,
                              remove: s.remove,
                              caption: s.caption,
                              submitReport: s.submitReport,
                              hint: s.reportHint.replace("{n}", String(a.photos_required)),
                            }}
                          />
                        </Sheet>
                      ) : null}
                      {canApprove && !st.done ? (
                        <Sheet
                          title={`${s.editForecast} · ${a.code}`}
                          description={s.forecastHint}
                          triggerLabel={<span className="sr-only">{s.editForecast}</span>}
                          triggerIcon={<CalendarRange />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                        >
                          <form action={updateForecast} className="space-y-3">
                            <Hidden values={{ ...hidden, activity_id: a.id }} />
                            <p className="text-2xs text-muted">
                              {s.cols.baseline}: {date(a.baseline_start)} –{" "}
                              {date(a.baseline_finish)}
                            </p>
                            <FormGrid>
                              <Field label={s.forecastStart} required>
                                <Input
                                  name="forecast_start"
                                  type="date"
                                  defaultValue={a.forecast_start ?? ""}
                                  required
                                />
                              </Field>
                              <Field label={s.forecastFinish} required>
                                <Input
                                  name="forecast_finish"
                                  type="date"
                                  defaultValue={a.forecast_finish ?? ""}
                                  required
                                />
                              </Field>
                            </FormGrid>
                            <SheetFooter>
                              <SubmitButton>{t.common.save}</SubmitButton>
                            </SheetFooter>
                          </form>
                        </Sheet>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <Panel
        title={t.nav.schedule}
        bodyClassName="p-0"
        actions={
          <div className="flex rounded-md border border-line text-2xs">
            {(["month", "week"] as const).map((z) => (
              <Link
                key={z}
                href={`${base}?zoom=${z}`}
                className={cn(
                  "px-2.5 py-1",
                  zoom === z ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink",
                )}
              >
                {z === "month" ? s.zoomMonth : s.zoomWeek}
              </Link>
            ))}
          </div>
        }
      >
        <Gantt
          groups={[{ key: unitId, label: unit.code, activities: acts }]}
          locale={locale}
          zoom={zoom}
          labels={{
            activity: s.cols.activity,
            delay: s.delay,
            days: s.days,
            baseline: s.baselineBar,
            today: s.today,
          }}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={s.gallery}
          actions={<span className="text-2xs text-muted num">{photos.length}</span>}
        >
          {photos.length ? (
            <div className="space-y-4 p-4">
              {acts
                .filter((a) => photosByActivity.get(a.id)?.length)
                .map((a) => (
                  <section key={a.id}>
                    <h3 className="mb-2 text-2xs font-semibold text-ink-2">
                      {a.code} · {activityName(a, locale)}
                    </h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {(photosByActivity.get(a.id) ?? []).map((p) => (
                        <PhotoThumb
                          key={p.id}
                          {...photoUrl(p)}
                          caption={p.caption}
                          meta={date(p.taken_at ?? p.uploaded_at)}
                          published={p.publication_status === "PUBLISHED"}
                        />
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          ) : (
            <EmptyState icon={<Images />} title={s.noPhotos} />
          )}
        </Panel>

        <Panel
          title={s.history}
          actions={<span className="text-2xs text-muted num">{updates.length}</span>}
        >
          {updates.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t.common.date}</TH>
                  <TH>{s.cols.activity}</TH>
                  <TH align="right">{s.cols.reported}</TH>
                  <TH align="right">{s.cols.verified}</TH>
                  <TH>{t.common.status}</TH>
                </tr>
              </THead>
              <tbody>
                {updates.slice(0, 60).map((u) => (
                  <TR key={u.id}>
                    <TD className="text-2xs whitespace-nowrap text-muted">{date(u.report_date)}</TD>
                    <TD className="max-w-56">
                      <p className="truncate text-2xs font-medium">{actName.get(u.activity_id)}</p>
                      <p className="truncate text-[10px] text-muted">
                        {s.reportedBy}: {nameOf(u.reporter) ?? s.imported}
                        {u.verified_at
                          ? ` · ${s.verifiedBy}: ${nameOf(u.verifier) ?? s.imported}`
                          : ""}
                      </p>
                    </TD>
                    <TD align="right" className="num">
                      {toNumber(u.reported_percent)}%
                    </TD>
                    <TD align="right" className="num">
                      {u.verified_at ? `${toNumber(u.verified_percent)}%` : "—"}
                    </TD>
                    <TD>
                      {!u.verified_at ? (
                        <Badge tone="warning">{s.pending}</Badge>
                      ) : u.publication_status === "PUBLISHED" ? (
                        <Badge tone="success">
                          <CheckCircle2 className="size-3" />
                          {s.published}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">{s.internal}</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<ClipboardCheck />} title={s.noHistory} />
          )}
        </Panel>
      </div>
    </div>
  );
}
