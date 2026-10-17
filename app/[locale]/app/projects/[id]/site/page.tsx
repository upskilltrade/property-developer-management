import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardCheck,
  FileQuestion,
  HardHat,
  NotebookPen,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate } from "@/lib/format";
import { scheduleStages } from "@/lib/schedule";
import {
  defectTone,
  inspectionResults,
  inspectionTone,
  partnerTypes,
  rfiTone,
  severities,
  severityTone,
  siTone,
  weathers,
} from "@/lib/site";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addContact,
  assignActivities,
  assignPartner,
  endAssignment,
  issueInstruction,
  openDefect,
  raiseRfi,
  recordInspection,
  savePartner,
  submitSiteReport,
  updateDefect,
  updateInstruction,
  verifySiteReport,
} from "./actions";

export const metadata: Metadata = { title: "Site" };

const views = ["partners", "rfis", "instructions", "reports", "inspections", "defects"] as const;
type View = (typeof views)[number];

/** Site operations for one project: partners & assignments, RFIs, SIs, daily reports, inspections, defects. */
export default async function ProjectSite({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { view: requested } = await searchParams;
  const view: View = (views as readonly string[]).includes(requested ?? "")
    ? (requested as View)
    : "partners";
  const { supabase } = await getSession(locale);
  const s = t.site;
  const base = `/${locale}/app/projects/${id}/site`;
  const back = `${base}?view=${view}`;
  const today = new Date().toISOString().slice(0, 10);

  const { data: project } = await supabase
    .from("projects")
    .select("id,organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const [{ data: units }, { data: partners }, { data: assignments }] = await Promise.all([
    supabase.from("units").select("id,code").eq("project_id", id).order("code"),
    supabase
      .from("partner_organizations")
      .select(
        "id,name,partner_type,phone,email,status,partner_contacts(id,full_name,phone,role,profile_id)",
      )
      .order("name"),
    supabase
      .from("partner_assignments")
      .select("id,partner_id,unit_id,scope_description,start_date,end_date,status")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));
  const partnerName = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const assignedPartners = (partners ?? []).filter((p) =>
    (assignments ?? []).some((a) => a.partner_id === p.id && a.status === "ACTIVE"),
  );
  const ctx = { locale, return_to: back, project_id: id };

  const unitSelect = (name = "unit_id", required = false) => (
    <Select name={name} required={required} defaultValue="">
      {!required ? <option value="">{s.wholeProject}</option> : null}
      {(units ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.code}
        </option>
      ))}
    </Select>
  );
  const partnerSelect = (name = "partner_id", list = assignedPartners, optional = false) => (
    <Select name={name} required={!optional} defaultValue="">
      {optional ? <option value="">—</option> : null}
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-4">
      <Tabs
        active={view}
        items={views.map((v) => ({ key: v, label: s.views[v], href: `${base}?view=${v}` }))}
      />
      {view === "partners" ? <Partners /> : null}
      {view === "rfis" ? <Rfis /> : null}
      {view === "instructions" ? <Instructions /> : null}
      {view === "reports" ? <Reports /> : null}
      {view === "inspections" ? <Inspections /> : null}
      {view === "defects" ? <Defects /> : null}
    </div>
  );

  async function Partners() {
    const [{ data: members }, { data: activities }] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select("user_id,profiles:user_id(display_name)")
        .eq("organization_id", project!.organization_id),
      supabase
        .from("schedule_activities")
        .select("assigned_partner_id,unit_id")
        .eq("project_id", id)
        .not("assigned_partner_id", "is", null),
    ]);
    const memberName = (m: { user_id: string; profiles: unknown }) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as {
        display_name?: string;
      } | null;
      return p?.display_name ?? m.user_id.slice(0, 8);
    };
    return (
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel
          className="xl:col-span-3"
          title={s.assignments}
          actions={
            <div className="flex gap-2">
              {assignedPartners.length && units?.length ? (
                <Sheet
                  title={s.assignActivities}
                  description={s.assignActivitiesHint}
                  triggerLabel={s.assignActivities}
                  triggerVariant="secondary"
                  triggerSize="xs"
                >
                  <form action={assignActivities} className="space-y-3">
                    <Hidden values={ctx} />
                    <Field label={s.partner} required>
                      {partnerSelect()}
                    </Field>
                    <FormGrid>
                      <Field label={s.unit} required>
                        {unitSelect("unit_id", true)}
                      </Field>
                      <Field label={s.stage}>
                        <Select name="stage" defaultValue="">
                          <option value="">{s.allStages}</option>
                          {scheduleStages.map((st) => (
                            <option key={st} value={st}>
                              {label(t.status.stage, st)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FormGrid>
                    <SheetFooter>
                      <SubmitButton>{s.assign}</SubmitButton>
                    </SheetFooter>
                  </form>
                </Sheet>
              ) : null}
              {partners?.length ? (
                <Sheet title={s.assign} triggerLabel={s.assign} triggerSize="xs">
                  <form action={assignPartner} className="space-y-3">
                    <Hidden values={ctx} />
                    <Field label={s.partner} required>
                      {partnerSelect(
                        "partner_id",
                        (partners ?? []).filter((p) => p.status === "ACTIVE"),
                      )}
                    </Field>
                    <Field label={s.unit}>{unitSelect()}</Field>
                    <Field label={s.scope}>
                      <Input name="scope" />
                    </Field>
                    <FormGrid>
                      <Field label={s.startDate}>
                        <Input name="start_date" type="date" defaultValue={today} />
                      </Field>
                      <Field label={s.endDate}>
                        <Input name="end_date" type="date" />
                      </Field>
                    </FormGrid>
                    <SheetFooter>
                      <SubmitButton>{s.assign}</SubmitButton>
                    </SheetFooter>
                  </form>
                </Sheet>
              ) : null}
            </div>
          }
        >
          {assignments?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{s.partner}</TH>
                  <TH>{s.unit}</TH>
                  <TH>{s.scope}</TH>
                  <TH>{s.startDate}</TH>
                  <TH>{s.assignedActivities}</TH>
                  <TH>{t.common.status}</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {assignments.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{partnerName.get(a.partner_id)}</TD>
                    <TD className="font-mono text-[12px]">
                      {a.unit_id ? unitCode.get(a.unit_id) : s.wholeProject}
                    </TD>
                    <TD className="text-muted">{a.scope_description ?? "—"}</TD>
                    <TD className="text-muted">
                      {formatDate(locale, a.start_date)}
                      {a.end_date ? ` – ${formatDate(locale, a.end_date)}` : ""}
                    </TD>
                    <TD className="num">
                      {
                        (activities ?? []).filter(
                          (x) =>
                            x.assigned_partner_id === a.partner_id &&
                            (!a.unit_id || x.unit_id === a.unit_id),
                        ).length
                      }
                    </TD>
                    <TD>
                      <Badge tone={a.status === "ACTIVE" ? "success" : "neutral"}>{a.status}</Badge>
                    </TD>
                    <TD>
                      {a.status === "ACTIVE" ? (
                        <form action={endAssignment}>
                          <Hidden values={{ ...ctx, assignment_id: a.id }} />
                          <SubmitButton size="xs" variant="ghost">
                            {s.endAssignment}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<HardHat />} title="—" />
          )}
        </Panel>

        <Panel
          className="xl:col-span-2"
          title={s.partners}
          actions={
            <Sheet title={s.newPartner} triggerLabel={s.newPartner} triggerSize="xs">
              <form action={savePartner} className="space-y-3">
                <Hidden values={{ ...ctx, organization_id: project!.organization_id }} />
                <Field label={s.name} required>
                  <Input name="name" required />
                </Field>
                <FormGrid>
                  <Field label={s.partnerType}>
                    <Select name="partner_type" defaultValue="CONTRACTOR">
                      {partnerTypes.map((x) => (
                        <option key={x} value={x}>
                          {t.status.partnerType[x]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={s.taxRef}>
                    <Input name="tax_ref" />
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label={s.phone}>
                    <Input name="phone" type="tel" />
                  </Field>
                  <Field label={s.email}>
                    <Input name="email" type="email" />
                  </Field>
                </FormGrid>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          }
        >
          {partners?.length ? (
            <ul className="divide-y divide-line">
              {partners.map((p) => (
                <li key={p.id} className="px-4 py-3 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge tone="neutral">{label(t.status.partnerType, p.partner_type)}</Badge>
                    <Sheet
                      title={`${s.addContact} · ${p.name}`}
                      triggerLabel={s.addContact}
                      triggerIcon={<UserPlus />}
                      triggerVariant="ghost"
                      triggerSize="xs"
                    >
                      <form action={addContact} className="space-y-3">
                        <Hidden values={{ ...ctx, partner_id: p.id }} />
                        <Field label={s.contactName} required>
                          <Input name="full_name" required />
                        </Field>
                        <FormGrid>
                          <Field label={s.phone}>
                            <Input name="phone" type="tel" />
                          </Field>
                          <Field label={s.role}>
                            <Input name="role" />
                          </Field>
                        </FormGrid>
                        <Field label={s.portalUser} hint={s.portalHint}>
                          <Select name="profile_id" defaultValue="">
                            <option value="">{s.noPortal}</option>
                            {(members ?? []).map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {memberName(m)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <SheetFooter>
                          <SubmitButton>{t.common.save}</SubmitButton>
                        </SheetFooter>
                      </form>
                    </Sheet>
                  </div>
                  <p className="text-2xs text-muted">
                    {[p.phone, p.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {(p.partner_contacts ?? []).map((c) => (
                    <p key={c.id} className="mt-1 text-2xs">
                      {c.full_name}
                      {c.role ? ` · ${c.role}` : ""}
                      {c.profile_id ? (
                        <Badge tone="success" className="ml-1">
                          {s.portalUser}
                        </Badge>
                      ) : null}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<HardHat />} title={s.noPartners} />
          )}
        </Panel>
      </div>
    );
  }

  async function Rfis() {
    const { data: rfis } = await supabase
      .from("rfis")
      .select("id,rfi_no,subject,status,unit_id,partner_id,due_date,created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    return (
      <Panel
        title={s.views.rfis}
        actions={
          <Sheet title={s.raiseRfi} triggerLabel={s.raiseRfi} triggerSize="xs">
            <form action={raiseRfi} className="space-y-3">
              <Hidden values={ctx} />
              <Field label={s.subject} required>
                <Input name="subject" required />
              </Field>
              <Field label={s.question} required>
                <Textarea name="question" required />
              </Field>
              <FormGrid>
                <Field label={s.unit}>{unitSelect()}</Field>
                <Field label={s.partner}>
                  {partnerSelect("partner_id", assignedPartners, true)}
                </Field>
              </FormGrid>
              <Field label={s.dueDate}>
                <Input name="due_date" type="date" />
              </Field>
              <SheetFooter>
                <SubmitButton>{s.raiseRfi}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {rfis?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{s.rfiNo}</TH>
                <TH>{s.subject}</TH>
                <TH>{s.unit}</TH>
                <TH>{s.partner}</TH>
                <TH>{s.dueDate}</TH>
                <TH>{t.common.status}</TH>
              </tr>
            </THead>
            <tbody>
              {rfis.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`${base}/rfis/${r.id}`}
                      className="font-mono text-[12px] font-semibold hover:text-brand hover:underline"
                    >
                      {r.rfi_no}
                    </Link>
                  </TD>
                  <TD>{r.subject}</TD>
                  <TD className="font-mono text-[12px] text-muted">
                    {r.unit_id ? unitCode.get(r.unit_id) : "—"}
                  </TD>
                  <TD className="text-muted">
                    {r.partner_id ? partnerName.get(r.partner_id) : s.internal}
                  </TD>
                  <TD className="text-muted">{formatDate(locale, r.due_date)}</TD>
                  <TD>
                    <Badge tone={rfiTone[r.status] ?? "neutral"}>
                      {label(t.status.rfi, r.status)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<FileQuestion />} title={s.noRfis} />
        )}
      </Panel>
    );
  }

  async function Instructions() {
    const { data: list } = await supabase
      .from("site_instructions")
      .select(
        "id,si_no,title,instruction,status,unit_id,partner_id,issued_at,completion_note,rfis(rfi_no)",
      )
      .eq("project_id", id)
      .order("issued_at", { ascending: false });
    return (
      <Panel
        title={s.views.instructions}
        actions={
          assignedPartners.length ? (
            <Sheet title={s.issueSi} triggerLabel={s.issueSi} triggerSize="xs">
              <form action={issueInstruction} className="space-y-3">
                <Hidden values={ctx} />
                <FormGrid>
                  <Field label={s.partner} required>
                    {partnerSelect()}
                  </Field>
                  <Field label={s.unit}>{unitSelect()}</Field>
                </FormGrid>
                <Field label={s.title} required>
                  <Input name="title" required />
                </Field>
                <Field label={s.instruction} required>
                  <Textarea name="instruction" required />
                </Field>
                <SheetFooter>
                  <SubmitButton>{s.issueSi}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          ) : null
        }
      >
        {list?.length ? (
          <ul className="divide-y divide-line">
            {list.map((x) => {
              const rfi = Array.isArray(x.rfis) ? x.rfis[0] : x.rfis;
              return (
                <li key={x.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-mono text-[12px] font-semibold">{x.si_no}</span> ·{" "}
                      {x.title}
                    </p>
                    <p className="text-ink-2">{x.instruction}</p>
                    <p className="text-2xs text-muted">
                      {partnerName.get(x.partner_id)}
                      {x.unit_id ? ` · ${unitCode.get(x.unit_id)}` : ""} ·{" "}
                      {formatDate(locale, x.issued_at)}
                      {rfi ? ` · ${s.fromRfi} ${rfi.rfi_no}` : ""}
                      {x.completion_note ? ` · “${x.completion_note}”` : ""}
                    </p>
                  </div>
                  <Badge tone={siTone[x.status] ?? "neutral"}>{label(t.status.si, x.status)}</Badge>
                  {x.status === "ISSUED" || x.status === "ACKNOWLEDGED" ? (
                    <form action={updateInstruction}>
                      <Hidden values={{ ...ctx, si_id: x.id, action: "CANCEL" }} />
                      <SubmitButton size="xs" variant="ghost">
                        {s.cancel}
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<NotebookPen />} title={s.noInstructions} />
        )}
      </Panel>
    );
  }

  async function Reports() {
    const { data: list } = await supabase
      .from("site_reports")
      .select("id,report_date,weather,manpower,work_summary,issues,partner_id,verified_at")
      .eq("project_id", id)
      .order("report_date", { ascending: false })
      .limit(60);
    return (
      <Panel
        title={s.views.reports}
        actions={
          <Sheet title={s.submitReport} triggerLabel={s.submitReport} triggerSize="xs">
            <SiteReportForm />
          </Sheet>
        }
      >
        {list?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{s.reportDate}</TH>
                <TH>{s.reportedBy}</TH>
                <TH>{s.weather}</TH>
                <TH align="right">{s.manpower}</TH>
                <TH>{s.workSummary}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {list.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">{formatDate(locale, r.report_date)}</TD>
                  <TD className="text-muted">
                    {r.partner_id ? partnerName.get(r.partner_id) : s.internal}
                  </TD>
                  <TD className="text-muted">{label(t.status.weather, r.weather)}</TD>
                  <TD align="right" className="num">
                    {r.manpower}
                  </TD>
                  <TD>
                    {r.work_summary}
                    {r.issues ? <p className="text-2xs text-amber-700">{r.issues}</p> : null}
                  </TD>
                  <TD>
                    {r.verified_at ? (
                      <Badge tone="success">{s.verified}</Badge>
                    ) : (
                      <form action={verifySiteReport}>
                        <Hidden values={{ ...ctx, report_id: r.id }} />
                        <SubmitButton size="xs" variant="secondary">
                          {s.verify}
                        </SubmitButton>
                      </form>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<NotebookPen />} title={s.noReports} />
        )}
      </Panel>
    );
  }

  function SiteReportForm() {
    return (
      <form action={submitSiteReport} className="space-y-3">
        <Hidden values={ctx} />
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
    );
  }

  async function Inspections() {
    const { data: list } = await supabase
      .from("inspections")
      .select("id,inspection_no,title,inspected_on,result,notes,unit_id")
      .eq("project_id", id)
      .order("inspected_on", { ascending: false });
    return (
      <Panel
        title={s.views.inspections}
        actions={
          <Sheet title={s.recordInspection} triggerLabel={s.recordInspection} triggerSize="xs">
            <form action={recordInspection} className="space-y-3">
              <Hidden values={ctx} />
              <Field label={s.title} required>
                <Input name="title" required />
              </Field>
              <FormGrid cols={3}>
                <Field label={s.unit}>{unitSelect()}</Field>
                <Field label={s.result} required>
                  <Select name="result" defaultValue="PASS">
                    {inspectionResults.map((x) => (
                      <option key={x} value={x}>
                        {t.status.inspection[x]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={s.inspectedOn}>
                  <Input name="inspected_on" type="date" defaultValue={today} />
                </Field>
              </FormGrid>
              <Field label={s.notes}>
                <Textarea name="notes" />
              </Field>
              <SheetFooter>
                <SubmitButton>{s.recordInspection}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {list?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{s.inspectionNo}</TH>
                <TH>{s.title}</TH>
                <TH>{s.unit}</TH>
                <TH>{s.inspectedOn}</TH>
                <TH>{s.result}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {list.map((x) => (
                <TR key={x.id}>
                  <TD className="font-mono text-[12px] font-semibold">{x.inspection_no}</TD>
                  <TD>
                    {x.title}
                    {x.notes ? <p className="text-2xs text-muted">{x.notes}</p> : null}
                  </TD>
                  <TD className="font-mono text-[12px] text-muted">
                    {x.unit_id ? unitCode.get(x.unit_id) : "—"}
                  </TD>
                  <TD className="text-muted">{formatDate(locale, x.inspected_on)}</TD>
                  <TD>
                    <Badge tone={inspectionTone[x.result] ?? "neutral"}>
                      {label(t.status.inspection, x.result)}
                    </Badge>
                  </TD>
                  <TD>
                    {x.result !== "PASS" ? (
                      <Sheet
                        title={`${s.openDefect} · ${x.inspection_no}`}
                        triggerLabel={s.openDefect}
                        triggerIcon={<ShieldAlert />}
                        triggerVariant="ghost"
                        triggerSize="xs"
                      >
                        <DefectForm inspectionId={x.id} unitId={x.unit_id} />
                      </Sheet>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<ClipboardCheck />} title={s.noInspections} />
        )}
      </Panel>
    );
  }

  function DefectForm({ inspectionId, unitId }: { inspectionId?: string; unitId?: string | null }) {
    return (
      <form action={openDefect} className="space-y-3">
        <Hidden values={{ ...ctx, inspection_id: inspectionId ?? "" }} />
        <Field label={s.title} required>
          <Input name="title" required />
        </Field>
        <FormGrid cols={3}>
          <Field label={s.unit}>
            <Select name="unit_id" defaultValue={unitId ?? ""}>
              <option value="">{s.wholeProject}</option>
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.severity}>
            <Select name="severity" defaultValue="MEDIUM">
              {severities.map((x) => (
                <option key={x} value={x}>
                  {t.status.severity[x]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.dueDate}>
            <Input name="due_date" type="date" />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={s.location}>
            <Input name="location" />
          </Field>
          <Field label={s.partner}>
            {partnerSelect("assigned_partner_id", assignedPartners, true)}
          </Field>
        </FormGrid>
        <Field label={s.description}>
          <Textarea name="description" />
        </Field>
        <SheetFooter>
          <SubmitButton>{s.openDefect}</SubmitButton>
        </SheetFooter>
      </form>
    );
  }

  async function Defects() {
    const { data: list } = await supabase
      .from("defects")
      .select(
        "id,defect_no,title,description,location,severity,status,unit_id,assigned_partner_id,due_date,fix_note,reopen_count",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    return (
      <Panel
        title={s.views.defects}
        actions={
          <Sheet title={s.openDefect} triggerLabel={s.openDefect} triggerSize="xs">
            <DefectForm />
          </Sheet>
        }
      >
        {list?.length ? (
          <ul className="divide-y divide-line">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-mono text-[12px] font-semibold">{d.defect_no}</span> ·{" "}
                    {d.title}
                    <Badge tone={severityTone[d.severity] ?? "neutral"} className="ml-2">
                      {label(t.status.severity, d.severity)}
                    </Badge>
                  </p>
                  {d.description ? <p className="text-ink-2">{d.description}</p> : null}
                  <p className="text-2xs text-muted">
                    {d.unit_id ? unitCode.get(d.unit_id) : s.wholeProject}
                    {d.location ? ` · ${d.location}` : ""}
                    {d.assigned_partner_id ? ` · ${partnerName.get(d.assigned_partner_id)}` : ""}
                    {d.due_date ? ` · ${s.dueDate} ${formatDate(locale, d.due_date)}` : ""}
                  </p>
                  {d.fix_note ? (
                    <p className="text-2xs whitespace-pre-line text-emerald-700">{d.fix_note}</p>
                  ) : null}
                </div>
                <Badge tone={defectTone[d.status] ?? "neutral"}>
                  {label(t.status.defect, d.status)}
                </Badge>
                {d.status === "OPEN" ? (
                  <form action={updateDefect} className="flex items-center gap-1">
                    <Hidden values={{ ...ctx, defect_id: d.id, action: "FIX" }} />
                    <Input name="note" placeholder={s.fixNote} className="h-6 w-36 text-2xs" />
                    <SubmitButton size="xs" variant="secondary">
                      {s.fix}
                    </SubmitButton>
                  </form>
                ) : null}
                {d.status === "FIXED" ? (
                  <form action={updateDefect} className="flex items-center gap-1">
                    <Hidden values={{ ...ctx, defect_id: d.id }} />
                    <Input name="note" placeholder={s.reopenReason} className="h-6 w-32 text-2xs" />
                    <SubmitButton size="xs" variant="success" name="action" value="VERIFY">
                      {s.verify}
                    </SubmitButton>
                    <SubmitButton size="xs" variant="danger" name="action" value="REOPEN">
                      {s.reopen}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ShieldAlert />} title={s.noDefects} />
        )}
      </Panel>
    );
  }
}
