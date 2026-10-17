import { FileText, HardHat } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { activityName } from "@/lib/schedule";
import { defectTone, rfiTone, severityTone, siTone, weathers } from "@/lib/site";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";
import { ReportProgressForm } from "@/components/domain/report-progress-form";
import {
  fixDefect,
  raiseRfi,
  replyRfi,
  reportProgress,
  submitSiteReport,
  updateInstruction,
} from "./actions";

type Scope = {
  project_id: string;
  project_code: string;
  project_name: string;
  unit_id: string;
  unit_code: string;
};

/**
 * Contractor portal. Everything here is filtered by the database to the partner's active
 * assignments: assigned activities, released drawings, own RFIs, site instructions and defects.
 */
export default async function ContractorPortal({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { supabase } = await getSession(locale);
  const c = t.portal.contractor;
  const s = t.site;
  const sc = t.schedule;
  const back = `/${locale}/app/contractor`;
  const today = new Date().toISOString().slice(0, 10);

  const { data: scopeRows } = await supabase.rpc("contractor_scope");
  const scope = (scopeRows ?? []) as Scope[];
  if (!scope.length) {
    return (
      <PortalPlaceholder
        icon={<HardHat />}
        title={c.title}
        body={c.noAssignment}
        tone="brand"
        homeHref={`/${locale}/workspace`}
        homeLabel={t.portal.goHome}
      />
    );
  }
  const projects = [...new Map(scope.map((x) => [x.project_id, x])).values()];
  const unitCode = new Map(scope.map((x) => [x.unit_id, x.unit_code]));

  const [
    { data: activities },
    { data: updates },
    { data: revisions },
    { data: rfis },
    { data: sis },
    { data: defects },
  ] = await Promise.all([
    supabase
      .from("schedule_activities")
      .select(
        "id,organization_id,project_id,unit_id,code,name_th,name_en,stage,sequence,photos_required,reported_percent,verified_percent,forecast_finish",
      )
      .order("sequence"),
    supabase
      .from("progress_updates")
      .select("activity_id,report_date,reported_percent,verified_percent,verified_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("drawing_revisions")
      .select(
        "id,revision_code,released_at,file_path,drawings!drawing_revisions_drawing_id_fkey(drawing_no,title,discipline)",
      )
      .eq("status", "RELEASED"),
    supabase
      .from("rfis")
      .select(
        "id,project_id,rfi_no,subject,question,status,created_at,rfi_responses(id,body,is_answer,created_at)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("site_instructions")
      .select("id,si_no,title,instruction,status,unit_id,issued_at")
      .order("issued_at", { ascending: false }),
    supabase
      .from("defects")
      .select("id,defect_no,title,description,location,severity,status,unit_id,due_date,fix_note")
      .order("created_at", { ascending: false }),
  ]);
  const openWork = (activities ?? []).filter((a) => toNumber(a.verified_percent) < 100);
  const doneCount = (activities ?? []).length - openWork.length;
  const lastUpdate = (activityId: string) =>
    (updates ?? []).find((u) => u.activity_id === activityId);
  const paths = (revisions ?? []).map((r) => r.file_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from("design-files").createSignedUrls(paths, 600)
    : { data: [] };
  const fileUrl = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const projectSelect = (
    <Select name="project_id" required defaultValue={projects[0]?.project_id}>
      {projects.map((p) => (
        <option key={p.project_id} value={p.project_id}>
          {p.project_code} · {p.project_name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{c.title}</h1>
          <p className="text-2xs text-muted">
            {projects.map((p) => p.project_code).join(", ")} ·{" "}
            {scope.map((x) => x.unit_code).join(", ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Sheet title={s.raiseRfi} triggerLabel={s.raiseRfi} triggerVariant="secondary">
            <form action={raiseRfi} className="space-y-3">
              <Hidden values={{ locale, return_to: back }} />
              <FormGrid>
                <Field label={t.sales.fields.project}>{projectSelect}</Field>
                <Field label={s.unit}>
                  <Select name="unit_id" defaultValue="">
                    <option value="">—</option>
                    {scope.map((x) => (
                      <option key={x.unit_id} value={x.unit_id}>
                        {x.unit_code}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <Field label={s.subject} required>
                <Input name="subject" required />
              </Field>
              <Field label={s.question} required>
                <Textarea name="question" required />
              </Field>
              <SheetFooter>
                <SubmitButton>{s.raiseRfi}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
          <Sheet title={c.siteReport} triggerLabel={c.siteReport}>
            <form action={submitSiteReport} className="space-y-3">
              <Hidden values={{ locale, return_to: back }} />
              <Field label={t.sales.fields.project}>{projectSelect}</Field>
              <FormGrid cols={3}>
                <Field label={s.reportDate} required>
                  <Input name="report_date" type="date" defaultValue={today} max={today} required />
                </Field>
                <Field label={s.weather}>
                  <Select name="weather" defaultValue="SUNNY">
                    {weathers.map((w) => (
                      <option key={w} value={w}>
                        {t.status.weather[w]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={s.manpower}>
                  <Input name="manpower" type="number" min="0" defaultValue="0" />
                </Field>
              </FormGrid>
              <Field label={s.workSummary} required>
                <Textarea name="work_summary" required />
              </Field>
              <Field label={s.issues}>
                <Textarea name="issues" />
              </Field>
              <SheetFooter>
                <SubmitButton>{s.submitReport}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        </div>
      </div>

      {defects?.length ? (
        <Panel title={c.defects}>
          <ul className="divide-y divide-line">
            {defects.map((d) => (
              <li key={d.id} className="space-y-2 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">{d.defect_no}</span>
                  <span className="font-medium">{d.title}</span>
                  <Badge tone={severityTone[d.severity] ?? "neutral"}>
                    {label(t.status.severity, d.severity)}
                  </Badge>
                  <Badge tone={defectTone[d.status] ?? "neutral"} className="ml-auto">
                    {label(t.status.defect, d.status)}
                  </Badge>
                </div>
                <p className="text-2xs text-muted">
                  {d.unit_id ? unitCode.get(d.unit_id) : ""}
                  {d.location ? ` · ${d.location}` : ""}
                  {d.due_date ? ` · ${s.dueDate} ${formatDate(locale, d.due_date)}` : ""}
                  {d.description ? ` · ${d.description}` : ""}
                </p>
                {d.fix_note ? (
                  <p className="text-2xs whitespace-pre-line text-emerald-700">{d.fix_note}</p>
                ) : null}
                {d.status === "OPEN" ? (
                  <form action={fixDefect} className="flex flex-wrap items-center gap-1.5">
                    <Hidden values={{ locale, return_to: back, defect_id: d.id }} />
                    <Input
                      name="note"
                      placeholder={s.fixNote}
                      className="h-7 min-w-48 flex-1 text-2xs"
                    />
                    <SubmitButton size="xs">{s.fix}</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {sis?.length ? (
        <Panel title={c.instructions}>
          <ul className="divide-y divide-line">
            {sis.map((x) => (
              <li key={x.id} className="space-y-1.5 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">{x.si_no}</span>
                  <span className="font-medium">{x.title}</span>
                  <Badge tone={siTone[x.status] ?? "neutral"} className="ml-auto">
                    {label(t.status.si, x.status)}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-ink-2">{x.instruction}</p>
                <p className="text-2xs text-muted">
                  {x.unit_id ? `${unitCode.get(x.unit_id)} · ` : ""}
                  {formatDate(locale, x.issued_at)}
                </p>
                {x.status === "ISSUED" || x.status === "ACKNOWLEDGED" ? (
                  <form action={updateInstruction} className="flex flex-wrap items-center gap-1.5">
                    <Hidden values={{ locale, return_to: back, si_id: x.id }} />
                    <Input
                      name="note"
                      placeholder={s.fixNote}
                      className="h-7 min-w-48 flex-1 text-2xs"
                    />
                    {x.status === "ISSUED" ? (
                      <SubmitButton size="xs" variant="secondary" name="action" value="ACKNOWLEDGE">
                        {s.acknowledge}
                      </SubmitButton>
                    ) : null}
                    <SubmitButton size="xs" variant="success" name="action" value="DONE">
                      {s.markDone}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title={c.myWork}
        description={doneCount ? `${c.verified} 100%: ${doneCount}` : undefined}
      >
        {openWork.length ? (
          <ul className="divide-y divide-line">
            {openWork.map((a) => {
              const last = lastUpdate(a.id);
              const pending = last && !last.verified_at;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <span className="font-mono text-[12px] text-muted">
                        {a.unit_id ? unitCode.get(a.unit_id) : "—"}
                      </span>{" "}
                      {activityName(a, locale)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={toNumber(a.verified_percent)} className="w-32" />
                      <span className="text-2xs text-muted num">
                        {c.verified} {toNumber(a.verified_percent).toFixed(0)}%
                      </span>
                      {pending ? (
                        <Badge tone="warning">
                          {c.reported} {toNumber(last.reported_percent).toFixed(0)}% ·{" "}
                          {c.pendingVerify}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Sheet
                    title={`${c.report} · ${a.code}`}
                    description={activityName(a, locale)}
                    triggerLabel={sc.reportShort}
                    triggerVariant="secondary"
                    triggerSize="xs"
                  >
                    <ReportProgressForm
                      action={reportProgress}
                      hidden={{ locale, return_to: back, activity_id: a.id }}
                      folder={`${a.organization_id}/${a.project_id}/${a.unit_id ?? "project"}/${a.id}`}
                      photosRequired={a.photos_required}
                      defaultPercent={toNumber(last?.reported_percent ?? a.verified_percent)}
                      defaultDate={today}
                      labels={{
                        percent: sc.percent,
                        reportDate: sc.reportDate,
                        note: sc.note,
                        photosLabel: sc.photosLabel,
                        addPhotos: sc.addPhotos,
                        uploading: sc.uploading,
                        uploadFailed: sc.uploadFailed,
                        remove: sc.remove,
                        caption: sc.caption,
                        submitReport: sc.submitReport,
                        hint: sc.reportHint.replace("{n}", String(a.photos_required)),
                      }}
                    />
                  </Sheet>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-2xs text-faint">—</p>
        )}
      </Panel>

      <Panel title={c.drawings}>
        {revisions?.length ? (
          <ul className="divide-y divide-line">
            {revisions.map((r) => {
              const d = one(r.drawings);
              const href = fileUrl.get(r.file_path);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <span className="font-mono">{d?.drawing_no}</span> · {d?.title}
                    </p>
                    <p className="text-2xs text-muted">
                      rev {r.revision_code} · {label(t.status.discipline, d?.discipline)} ·{" "}
                      {formatDate(locale, r.released_at)}
                    </p>
                  </div>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-brand hover:underline"
                    >
                      {c.openDrawing}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-2xs text-faint">—</p>
        )}
      </Panel>

      {rfis?.length ? (
        <Panel title={c.rfis}>
          <ul className="divide-y divide-line">
            {rfis.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">{r.rfi_no}</span>
                  <span className="font-medium">{r.subject}</span>
                  <Badge tone={rfiTone[r.status] ?? "neutral"} className="ml-auto">
                    {label(t.status.rfi, r.status)}
                  </Badge>
                </div>
                <p className="text-ink-2">{r.question}</p>
                {(r.rfi_responses ?? [])
                  .slice()
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((x) => (
                    <p
                      key={x.id}
                      className={
                        x.is_answer
                          ? "rounded bg-emerald-50 px-2 py-1 text-[12px] text-emerald-900"
                          : "rounded bg-subtle px-2 py-1 text-[12px]"
                      }
                    >
                      {x.body}
                      <span className="ml-1 text-[10px] text-muted">
                        {formatDateTime(locale, x.created_at)}
                      </span>
                    </p>
                  ))}
                {r.status !== "CLOSED" ? (
                  <form action={replyRfi} className="flex items-center gap-1.5">
                    <Hidden values={{ locale, return_to: back, rfi_id: r.id }} />
                    <Input
                      name="body"
                      required
                      placeholder={s.reply}
                      className="h-7 flex-1 text-2xs"
                    />
                    <SubmitButton size="xs" variant="secondary">
                      {s.respond}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
