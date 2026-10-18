import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, ShieldCheck, Wrench } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, toNumber } from "@/lib/format";
import { handoverTone, inspectionPurposes, srTone } from "@/lib/handover";
import { hasReference, parseChecklist } from "@/lib/standards";
import { ChecklistEditor } from "@/components/domain/checklist-editor";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { assignService, saveChecklist, saveWarrantyType, updateService } from "./actions";

export const metadata: Metadata = { title: "Handover" };

const views = ["units", "service", "setup"] as const;
type View = (typeof views)[number];

/** Handover board per unit, after-sales service requests, and warranty/checklist setup. */
export default async function ProjectHandover({
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
    : "units";
  const { supabase } = await getSession(locale);
  const h = t.handover;
  const base = `/${locale}/app/projects/${id}/handover`;
  const back = `${base}?view=${view}`;

  const { data: project } = await supabase
    .from("projects")
    .select("id,organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const [{ data: units }, { data: partners }] = await Promise.all([
    supabase
      .from("units")
      .select(
        "id,code,status,unit_construction(progress_percent),unit_handovers(status,handover_date,inspection_scheduled_at)",
      )
      .eq("project_id", id)
      .order("code"),
    supabase.from("partner_organizations").select("id,name").eq("status", "ACTIVE").order("name"),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));
  const partnerName = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const ctx = { locale, return_to: back, project_id: id, organization_id: project.organization_id };

  return (
    <div className="space-y-4">
      <Tabs
        active={view}
        items={views.map((v) => ({ key: v, label: h.views[v], href: `${base}?view=${v}` }))}
      />
      {view === "units" ? <Units /> : null}
      {view === "service" ? <Service /> : null}
      {view === "setup" ? <Setup /> : null}
    </div>
  );

  async function Units() {
    const { data: defects } = await supabase
      .from("defects")
      .select("unit_id,severity,source,status")
      .eq("project_id", id)
      .neq("status", "VERIFIED");
    const count = (
      unit: string,
      pred: (d: { severity: string; source: string }) => boolean = () => true,
    ) => (defects ?? []).filter((d) => d.unit_id === unit && pred(d)).length;
    return (
      <Panel title={h.views.units}>
        {units?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{h.unit}</TH>
                <TH>{h.progress}</TH>
                <TH align="right">{h.openCritical}</TH>
                <TH align="right">{h.openDefects}</TH>
                <TH>{h.status}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {units.map((u) => {
                const ho = one(u.unit_handovers);
                const progress = toNumber(one(u.unit_construction)?.progress_percent);
                const critical = count(u.id, (d) => d.severity === "HIGH");
                return (
                  <TR key={u.id}>
                    <TD className="font-mono text-[12px] font-semibold">{u.code}</TD>
                    <TD>
                      <Progress value={progress} className="w-40" />
                    </TD>
                    <TD
                      align="right"
                      className={critical ? "font-semibold text-red-600" : "text-muted"}
                    >
                      {critical}
                    </TD>
                    <TD align="right" className="text-muted">
                      {count(u.id)}
                    </TD>
                    <TD>
                      <Badge tone={handoverTone[ho?.status ?? "NOT_READY"] ?? "neutral"}>
                        {label(t.status.handover, ho?.status ?? "NOT_READY")}
                      </Badge>
                      {ho?.handover_date ? (
                        <p className="text-[10px] text-muted">
                          {formatDate(locale, ho.handover_date)}
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <Link
                        href={`${base}/${u.id}`}
                        className="text-[13px] font-medium text-brand hover:underline"
                      >
                        {h.open}
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<KeyRound />} title={h.noUnits} />
        )}
      </Panel>
    );
  }

  async function Service() {
    const { data: list } = await supabase
      .from("service_requests")
      .select(
        "id,sr_no,title,description,location,status,in_warranty,unit_id,partner_id,due_date,resolution,created_at",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    return (
      <Panel title={h.serviceRequests}>
        {list?.length ? (
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-mono text-[12px] font-semibold">{s.sr_no}</span> ·{" "}
                    {s.title}
                    <Badge tone={s.in_warranty ? "success" : "neutral"} className="ml-2">
                      {s.in_warranty ? h.inWarranty : h.outOfWarranty}
                    </Badge>
                  </p>
                  <p className="text-ink-2">{s.description}</p>
                  <p className="text-2xs text-muted">
                    {unitCode.get(s.unit_id)}
                    {s.location ? ` · ${s.location}` : ""} · {formatDate(locale, s.created_at)}
                    {s.partner_id ? ` · ${partnerName.get(s.partner_id)}` : ""}
                    {s.due_date ? ` · ${h.dueDate} ${formatDate(locale, s.due_date)}` : ""}
                  </p>
                  {s.resolution ? (
                    <p className="text-2xs whitespace-pre-line text-emerald-700">{s.resolution}</p>
                  ) : null}
                </div>
                <Badge tone={srTone[s.status] ?? "neutral"}>{label(t.status.sr, s.status)}</Badge>
                {s.status === "OPEN" || s.status === "ASSIGNED" ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <form action={assignService} className="flex items-center gap-1">
                      <Hidden values={{ ...ctx, sr_id: s.id }} />
                      <Select
                        name="partner_id"
                        defaultValue={s.partner_id ?? ""}
                        className="h-6 w-36 text-2xs"
                      >
                        <option value="">—</option>
                        {(partners ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <Input
                        name="due_date"
                        type="date"
                        defaultValue={s.due_date ?? ""}
                        className="h-6 w-32 text-2xs"
                      />
                      <SubmitButton size="xs" variant="secondary">
                        {h.assign}
                      </SubmitButton>
                    </form>
                    <form action={updateService} className="flex items-center gap-1">
                      <Hidden values={{ ...ctx, sr_id: s.id }} />
                      <Input name="note" placeholder={h.resolution} className="h-6 w-36 text-2xs" />
                      <SubmitButton size="xs" variant="success" name="action" value="RESOLVE">
                        {h.resolve}
                      </SubmitButton>
                      <SubmitButton size="xs" variant="ghost" name="action" value="REJECT">
                        {h.reject}
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Wrench />} title={h.noRequests} />
        )}
      </Panel>
    );
  }

  async function Setup() {
    const [{ data: types }, { data: templates }] = await Promise.all([
      supabase
        .from("warranty_types")
        .select("id,code,name_th,name_en,months,default_partner_id,terms,active")
        .order("code"),
      supabase.from("checklist_templates").select("id,code,name,purpose,items").order("code"),
    ]);
    const { data: verified } = await supabase
      .from("inspection_standards")
      .select("id,code,title")
      .eq("status", "VERIFIED")
      .order("code");
    const standardOptions = (verified ?? []).map((x) => ({
      id: x.id,
      label: `${x.code} · ${x.title}`,
    }));
    const editor = (tpl?: { code: string; name: string; purpose: string; items: unknown }) => (
      <form action={saveChecklist} className="space-y-3">
        <Hidden values={ctx} />
        <FormGrid cols={3}>
          <Field label={h.code} required>
            <Input
              name="code"
              required
              placeholder="PRE-HO"
              defaultValue={tpl?.code}
              readOnly={Boolean(tpl)}
            />
          </Field>
          <Field label={h.purpose}>
            <Select name="purpose" defaultValue={tpl?.purpose ?? "PRE_HANDOVER"}>
              {inspectionPurposes.map((p) => (
                <option key={p} value={p}>
                  {t.status.inspectionPurpose[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.common.name} required>
            <Input name="name" required defaultValue={tpl?.name} />
          </Field>
        </FormGrid>
        <ChecklistEditor
          standards={standardOptions}
          labels={t.standards}
          initial={tpl ? parseChecklist(tpl.items) : []}
        />
        <SheetFooter>
          <SubmitButton disabled={!standardOptions.length}>{t.common.save}</SubmitButton>
        </SheetFooter>
      </form>
    );
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={h.warrantyTypes}
          actions={
            <Sheet title={h.newWarranty} triggerLabel={h.newWarranty} triggerSize="xs">
              <form action={saveWarrantyType} className="space-y-3">
                <Hidden values={ctx} />
                <FormGrid cols={3}>
                  <Field label={h.code} required>
                    <Input name="code" required placeholder="STRUCT" />
                  </Field>
                  <Field label={h.months} required>
                    <Input
                      name="months"
                      type="number"
                      min="1"
                      max="360"
                      required
                      defaultValue="12"
                    />
                  </Field>
                  <Field label={h.defaultPartner}>
                    <Select name="default_partner_id" defaultValue="">
                      <option value="">—</option>
                      {(partners ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label={h.nameTh} required>
                    <Input name="name_th" required />
                  </Field>
                  <Field label={h.nameEn}>
                    <Input name="name_en" />
                  </Field>
                </FormGrid>
                <Field label={h.terms}>
                  <Textarea name="terms" />
                </Field>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          }
        >
          {types?.length ? (
            <ul className="divide-y divide-line">
              {types.map((w) => (
                <li key={w.id} className="px-4 py-2.5 text-[13px]">
                  <span className="font-mono text-[12px] font-semibold">{w.code}</span> ·{" "}
                  {(locale === "en" && w.name_en) || w.name_th}
                  <span className="ml-2 text-2xs text-muted">
                    {w.months} {h.months.replace(/\s*\(.*\)/, "")}
                    {w.default_partner_id ? ` · ${partnerName.get(w.default_partner_id)}` : ""}
                  </span>
                  {w.terms ? <p className="text-2xs text-muted">{w.terms}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ShieldCheck />} title="—" />
          )}
        </Panel>

        <Panel
          title={h.checklists}
          actions={
            <Sheet title={h.newChecklist} triggerLabel={h.newChecklist} triggerSize="xs">
              {editor()}
            </Sheet>
          }
        >
          {templates?.length ? (
            <ul className="divide-y divide-line">
              {templates.map((c) => (
                <li key={c.id} className="px-4 py-2.5 text-[13px]">
                  <span className="font-mono text-[12px] font-semibold">{c.code}</span> · {c.name}
                  <Badge tone="neutral" className="ml-2">
                    {label(t.status.inspectionPurpose, c.purpose)}
                  </Badge>
                  <Sheet
                    title={`${c.code} · ${c.name}`}
                    triggerLabel={t.standards.edit}
                    triggerVariant="ghost"
                    triggerSize="xs"
                    width="lg"
                  >
                    {editor(c)}
                  </Sheet>
                  {parseChecklist(c.items).some((i) => !hasReference(i)) ? (
                    <p className="mt-1 text-2xs text-amber-800">{t.standards.missingReference}</p>
                  ) : null}
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-2xs text-muted">
                    {parseChecklist(c.items).map((i, n) => (
                      <li key={n}>
                        <span className="text-ink-2">{i.item}</span>
                        {hasReference(i) ? (
                          <span>
                            {" "}
                            — {t.standards.reference}: {i.standard_code} {i.clause}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ShieldCheck />} title="—" />
          )}
        </Panel>
      </div>
    );
  }
}
