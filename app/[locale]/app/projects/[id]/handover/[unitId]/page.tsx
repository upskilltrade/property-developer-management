import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileText,
  KeyRound,
  PackageCheck,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime, formatMoney, toNumber, today } from "@/lib/format";
import { localDateTime } from "@/lib/sales";
import { handoverSteps, handoverTone, inspectionPurposes, itemKinds, srTone } from "@/lib/handover";
import { defectTone, inspectionTone, severities, severityTone } from "@/lib/site";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { hasReference, parseChecklist, type ChecklistItem } from "@/lib/standards";
import { StorageUploadForm } from "@/components/domain/storage-upload-form";
import {
  acceptHandover,
  addItem,
  completeHandover,
  logCustomerDefect,
  markReady,
  recordInspection,
  scheduleInspection,
  setDelivered,
} from "../actions";

export const metadata: Metadata = { title: "Unit handover" };

type Readiness = {
  progress: number;
  open_critical: number;
  open_defects: number;
  open_customer_defects: number;
  outstanding: number;
  items_total: number;
  items_delivered: number;
};

/** One unit's path to handover: gate, customer inspection, acceptance, handover package, warranty. */
export default async function UnitHandover({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; unitId: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, unitId } = await params;
  const { template: templateId } = await searchParams;
  const { supabase } = await getSession(locale);
  const h = t.handover;
  const s = t.site;
  const base = `/${locale}/app/projects/${id}/handover`;
  const back = `${base}/${unitId}`;

  const [{ data: unit }, { data: project }] = await Promise.all([
    supabase
      .from("units")
      .select("id,code,status")
      .eq("id", unitId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.from("projects").select("organization_id").eq("id", id).maybeSingle(),
  ]);
  if (!unit || !project) notFound();
  const org = project.organization_id;
  const [
    { data: ho },
    { data: readinessRows },
    { data: defects },
    { data: inspections },
    { data: templates },
    { data: warranties },
    { data: services },
    { data: assigned },
  ] = await Promise.all([
    supabase
      .from("unit_handovers")
      .select("*,handover_items(*)")
      .eq("unit_id", unitId)
      .maybeSingle(),
    supabase.rpc("handover_readiness", { target_unit: unitId }),
    supabase
      .from("defects")
      .select("id,defect_no,title,location,severity,status,source,customer_visible")
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase
      .from("inspections")
      .select(
        "id,inspection_no,title,inspected_on,result,purpose,customer_visible,inspection_items(seq,item,result,note)",
      )
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase
      .from("checklist_templates")
      .select("id,code,name,purpose,items")
      .eq("active", true)
      .order("code"),
    supabase
      .from("unit_warranties")
      .select(
        "id,start_date,end_date,warranty_types(code,name_th,name_en),partner_organizations(name)",
      )
      .eq("unit_id", unitId),
    supabase
      .from("service_requests")
      .select("id,sr_no,title,status,created_at")
      .eq("unit_id", unitId)
      .order("created_at", { ascending: false }),
    supabase
      .from("partner_assignments")
      .select("partner_organizations(id,name)")
      .eq("project_id", id)
      .eq("status", "ACTIVE"),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const r = ((readinessRows ?? []) as Readiness[])[0];
  const status = ho?.status ?? "NOT_READY";
  const stepIndex = handoverSteps.indexOf(status as (typeof handoverSteps)[number]);
  const items = (ho?.handover_items ?? []) as {
    id: string;
    kind: string;
    description: string;
    quantity: number;
    reference: string | null;
    file_path: string | null;
    delivered: boolean;
  }[];
  const filePaths = [ho?.acknowledgement_path, ...items.map((i) => i.file_path)].filter(
    Boolean,
  ) as string[];
  const { data: signed } = filePaths.length
    ? await supabase.storage.from("handover-files").createSignedUrls(filePaths, 600)
    : { data: [] };
  const fileUrl = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const template = (templates ?? []).find((x) => x.id === templateId);
  // A template's rows carry their standard references; without one, free rows suit ad-hoc
  // (customer) inspections only — QC rows without a reference are rejected by the database.
  const templateItems: ChecklistItem[] = template
    ? parseChecklist(template.items)
    : [{ item: "" }, { item: "" }, { item: "" }];
  const partners = [
    ...new Map(
      (assigned ?? [])
        .map((a) => one(a.partner_organizations))
        .filter(Boolean)
        .map((p) => [p!.id, p!]),
    ).values(),
  ];
  const ctx = { locale, return_to: back, project_id: id, unit_id: unitId };
  const done = status === "HANDED_OVER";
  const check = (ok: boolean, text: string) => (
    <li className={cn("flex items-center gap-2", ok ? "text-emerald-700" : "text-amber-700")}>
      {ok ? <CheckCircle2 className="size-4" /> : <CircleDashed className="size-4" />}
      {text}
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={base} className={buttonClass("ghost", "sm", "-ml-2 px-2")}>
          <ArrowLeft />
        </Link>
        <h2 className="flex-1 text-lg font-semibold">
          <span className="font-mono">{unit.code}</span>
        </h2>
        <Badge tone={handoverTone[status] ?? "neutral"}>{label(t.status.handover, status)}</Badge>
      </div>

      <ol className="grid grid-cols-5 gap-1 text-center text-2xs">
        {handoverSteps.map((st, i) => (
          <li
            key={st}
            className={cn(
              "rounded-md border px-2 py-2",
              i < stepIndex && "border-emerald-200 bg-emerald-50 text-emerald-800",
              i === stepIndex && "border-brand bg-brand/5 font-semibold text-brand",
              i > stepIndex && "border-line text-muted",
            )}
          >
            {label(t.status.handover, st)}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title={h.readiness}>
            <ul className="grid gap-2 px-4 py-3 text-[13px] sm:grid-cols-2">
              {check(
                toNumber(r?.progress) >= 100,
                `${h.progress} ${toNumber(r?.progress).toFixed(1)}%`,
              )}
              {check(!r?.open_critical, `${h.openCritical}: ${r?.open_critical ?? 0}`)}
              {check(
                !r?.open_customer_defects,
                `${h.customerDefects}: ${r?.open_customer_defects ?? 0}`,
              )}
              {check(
                !toNumber(r?.outstanding),
                `${h.outstanding}: ${formatMoney(locale, r?.outstanding)}`,
              )}
              {check(
                !!r?.items_total && r.items_delivered === r.items_total,
                `${h.items}: ${r?.items_delivered ?? 0}/${r?.items_total ?? 0}`,
              )}
            </ul>
            {!done ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3">
                {status === "NOT_READY" ? (
                  <form action={markReady}>
                    <Hidden values={ctx} />
                    <SubmitButton title={h.markReadyHint}>{h.markReady}</SubmitButton>
                  </form>
                ) : null}
                {status === "READY" || status === "CUSTOMER_INSPECTION" ? (
                  <form action={scheduleInspection} className="flex items-end gap-2">
                    <Hidden values={ctx} />
                    <Field label={h.inspectionAt}>
                      <Input
                        name="scheduled_at"
                        type="datetime-local"
                        required
                        defaultValue={localDateTime(48)}
                      />
                    </Field>
                    <SubmitButton variant="secondary">{h.scheduleInspection}</SubmitButton>
                  </form>
                ) : null}
                {status === "CUSTOMER_INSPECTION" ? (
                  <>
                    <Sheet
                      title={h.logCustomerDefect}
                      triggerLabel={h.logCustomerDefect}
                      triggerVariant="secondary"
                    >
                      <form action={logCustomerDefect} className="space-y-3">
                        <Hidden values={ctx} />
                        <Field label={s.title} required>
                          <Input name="title" required />
                        </Field>
                        <Field label={s.location}>
                          <Input name="location" />
                        </Field>
                        <Field label={s.description}>
                          <Textarea name="description" />
                        </Field>
                        <SheetFooter>
                          <SubmitButton>{t.common.save}</SubmitButton>
                        </SheetFooter>
                      </form>
                    </Sheet>
                    <form action={acceptHandover}>
                      <Hidden values={ctx} />
                      <SubmitButton variant="success" title={h.acceptHint}>
                        {h.accept}
                      </SubmitButton>
                    </form>
                  </>
                ) : null}
                {status === "ACCEPTED" ? (
                  <Sheet
                    title={h.complete}
                    description={h.completeHint}
                    triggerLabel={h.complete}
                    triggerIcon={<KeyRound />}
                  >
                    <StorageUploadForm
                      action={completeHandover}
                      hidden={ctx}
                      bucket="handover-files"
                      folder={`${org}/${id}/${unitId}`}
                      accept="application/pdf,image/*"
                      labels={{
                        file: h.acknowledgement,
                        submit: h.complete,
                        uploadFailed: t.design.uploadFailed,
                        hint: h.completeHint,
                      }}
                    >
                      <FormGrid>
                        <Field label={h.handoverDate} required>
                          <Input
                            name="handover_date"
                            type="date"
                            required
                            defaultValue={today()}
                            max={today()}
                          />
                        </Field>
                        <Field label={h.transferDate}>
                          <Input name="transfer_date" type="date" defaultValue={today()} />
                        </Field>
                      </FormGrid>
                    </StorageUploadForm>
                  </Sheet>
                ) : null}
              </div>
            ) : null}
            {ho?.inspection_scheduled_at || ho?.accepted_at || ho?.handover_date ? (
              <p className="border-t border-line px-4 py-2 text-2xs text-muted">
                {ho?.inspection_scheduled_at
                  ? `${h.inspectionAt}: ${formatDateTime(locale, ho.inspection_scheduled_at)} · `
                  : ""}
                {ho?.accepted_at
                  ? `${h.acceptedAt} ${formatDateTime(locale, ho.accepted_at)} (${ho.accepted_by_customer ? h.byCustomer : h.byStaff}) · `
                  : ""}
                {ho?.handover_date
                  ? `${h.handoverDate} ${formatDate(locale, ho.handover_date)} · ${h.transferDate} ${formatDate(locale, ho.transfer_date)}`
                  : ""}
                {ho?.acknowledgement_path && fileUrl.get(ho.acknowledgement_path) ? (
                  <a
                    href={fileUrl.get(ho.acknowledgement_path)!}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-brand hover:underline"
                  >
                    {h.acknowledgement}
                  </a>
                ) : null}
              </p>
            ) : null}
          </Panel>

          <Panel
            title={h.defects}
            actions={
              !done ? (
                <Sheet
                  title={h.recordInspection}
                  triggerLabel={h.recordInspection}
                  triggerIcon={<ClipboardCheck />}
                  triggerVariant="secondary"
                  triggerSize="xs"
                  width="lg"
                >
                  <div className="mb-3 flex flex-wrap gap-1">
                    {(templates ?? []).map((tp) => (
                      <Link
                        key={tp.id}
                        href={`${back}?template=${tp.id}`}
                        className={buttonClass(
                          tp.id === templateId ? "primary" : "secondary",
                          "xs",
                        )}
                      >
                        {tp.code}
                      </Link>
                    ))}
                  </div>
                  <form action={recordInspection} className="space-y-3">
                    <Hidden values={ctx} />
                    <FormGrid>
                      <Field label={s.title} required>
                        <Input name="title" required defaultValue={template?.name ?? ""} />
                      </Field>
                      <Field label={h.purpose}>
                        <Select name="purpose" defaultValue={template?.purpose ?? "PRE_HANDOVER"}>
                          {inspectionPurposes.map((p) => (
                            <option key={p} value={p}>
                              {t.status.inspectionPurpose[p]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FormGrid>
                    {partners.length ? (
                      <Field label={s.partner}>
                        <Select name="assigned_partner_id" defaultValue="">
                          <option value="">—</option>
                          {partners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                    {templateItems.map((it, i) => (
                      <div key={i} className="space-y-1 rounded-md border border-line p-2">
                        <div className="grid grid-cols-[1fr_6rem_6rem_1fr] gap-2">
                          <Hidden
                            values={{
                              item_standard_id: it.standard_id ?? "",
                              item_clause: it.clause ?? "",
                              item_criterion: it.criterion ?? "",
                            }}
                          />
                          <Input
                            name="item_text"
                            defaultValue={it.item}
                            readOnly={Boolean(template)}
                            placeholder={s.title}
                          />
                          <Select name="item_result" defaultValue="PASS">
                            <option value="PASS">{h.pass}</option>
                            <option value="FAIL">{h.fail}</option>
                            <option value="NA">{h.na}</option>
                          </Select>
                          <Select name="item_severity" defaultValue="MEDIUM" title={h.severity}>
                            {severities.map((x) => (
                              <option key={x} value={x}>
                                {t.status.severity[x]}
                              </option>
                            ))}
                          </Select>
                          <Input name="item_note" placeholder={s.notes} />
                        </div>
                        {hasReference(it) ? (
                          <p className="text-2xs text-muted">
                            <span className="font-medium text-ink-2">
                              {t.standards.reference}: {it.standard_code} · {it.clause}
                            </span>{" "}
                            — {it.criterion}
                            {it.method ? ` (${it.method})` : ""}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" name="customer_visible" />
                      {h.shareCustomer}
                    </label>
                    <SheetFooter>
                      <SubmitButton>{h.recordInspection}</SubmitButton>
                    </SheetFooter>
                  </form>
                </Sheet>
              ) : null
            }
          >
            {inspections?.length ? (
              <ul className="divide-y divide-line border-b border-line">
                {inspections.map((i) => (
                  <li key={i.id} className="px-4 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold">{i.inspection_no}</span>
                      <span>{i.title}</span>
                      <Badge tone="neutral">{label(t.status.inspectionPurpose, i.purpose)}</Badge>
                      {i.customer_visible ? <Badge tone="info">{h.shareCustomer}</Badge> : null}
                      <Badge tone={inspectionTone[i.result] ?? "neutral"} className="ml-auto">
                        {label(t.status.inspection, i.result)}
                      </Badge>
                    </div>
                    <p className="text-2xs text-muted">
                      {formatDate(locale, i.inspected_on)} ·{" "}
                      {(i.inspection_items ?? [])
                        .slice()
                        .sort((a, b) => a.seq - b.seq)
                        .map(
                          (x) =>
                            `${x.result === "FAIL" ? "✗" : x.result === "PASS" ? "✓" : "–"} ${x.item}`,
                        )
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {defects?.length ? (
              <ul className="divide-y divide-line">
                {defects.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]"
                  >
                    <span className="font-mono text-[12px]">{d.defect_no}</span>
                    <span className="min-w-0 flex-1">
                      {d.title}
                      {d.location ? (
                        <span className="text-2xs text-muted"> · {d.location}</span>
                      ) : null}
                    </span>
                    {d.source === "CUSTOMER" ? (
                      <Badge tone="accent">{t.changes.customer}</Badge>
                    ) : null}
                    <Badge tone={severityTone[d.severity] ?? "neutral"}>
                      {label(t.status.severity, d.severity)}
                    </Badge>
                    <Badge tone={defectTone[d.status] ?? "neutral"}>
                      {label(t.status.defect, d.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-2xs text-faint">{s.noDefects}</p>
            )}
            <p className="border-t border-line px-4 py-2 text-2xs text-muted">
              <Link
                href={`/${locale}/app/projects/${id}/site?view=defects`}
                className="text-brand hover:underline"
              >
                {s.views.defects} →
              </Link>
            </p>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title={h.items}
            actions={
              !done ? (
                <Sheet
                  title={h.addItem}
                  triggerLabel={h.addItem}
                  triggerIcon={<PackageCheck />}
                  triggerVariant="secondary"
                  triggerSize="xs"
                >
                  <StorageUploadForm
                    action={addItem}
                    hidden={ctx}
                    bucket="handover-files"
                    folder={`${org}/${id}/${unitId}`}
                    accept="application/pdf,image/*"
                    optional
                    labels={{
                      file: h.file,
                      submit: h.addItem,
                      uploadFailed: t.design.uploadFailed,
                    }}
                  >
                    <FormGrid>
                      <Field label={h.kind}>
                        <Select name="kind" defaultValue="KEY">
                          {itemKinds.map((k) => (
                            <option key={k} value={k}>
                              {t.status.itemKind[k]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={h.quantity}>
                        <Input name="quantity" type="number" min="1" step="any" defaultValue="1" />
                      </Field>
                    </FormGrid>
                    <Field label={h.description} required>
                      <Input name="description" required />
                    </Field>
                    <Field label={h.reference}>
                      <Input name="reference" />
                    </Field>
                  </StorageUploadForm>
                </Sheet>
              ) : null
            }
          >
            {items.length ? (
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                    {i.delivered ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <CircleDashed className="size-4 shrink-0 text-faint" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p>
                        {i.description}{" "}
                        <span className="text-2xs text-muted">× {toNumber(i.quantity)}</span>
                      </p>
                      <p className="text-2xs text-muted">
                        {label(t.status.itemKind, i.kind)}
                        {i.reference ? ` · ${i.reference}` : ""}
                        {i.file_path && fileUrl.get(i.file_path) ? (
                          <a
                            href={fileUrl.get(i.file_path)!}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 text-brand"
                          >
                            <FileText className="inline size-3" />
                          </a>
                        ) : null}
                      </p>
                    </div>
                    {!done ? (
                      <form action={setDelivered}>
                        <Hidden
                          values={{ ...ctx, item_id: i.id, delivered: String(!i.delivered) }}
                        />
                        <SubmitButton size="xs" variant={i.delivered ? "ghost" : "secondary"}>
                          {i.delivered ? "↺" : h.markDelivered}
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-2xs text-faint">—</p>
            )}
          </Panel>

          <Panel title={h.warranties}>
            {warranties?.length ? (
              <ul className="divide-y divide-line">
                {warranties.map((w) => {
                  const wt = one(w.warranty_types);
                  return (
                    <li key={w.id} className="px-4 py-2.5 text-[13px]">
                      <p className="font-medium">
                        {(locale === "en" && wt?.name_en) || wt?.name_th}
                      </p>
                      <p className="text-2xs text-muted">
                        {formatDate(locale, w.start_date)} – {formatDate(locale, w.end_date)}
                        {one(w.partner_organizations)?.name
                          ? ` · ${one(w.partner_organizations)?.name}`
                          : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-2xs text-faint">—</p>
            )}
          </Panel>

          {services?.length ? (
            <Panel title={h.serviceRequests}>
              <ul className="divide-y divide-line">
                {services.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                    <span className="font-mono text-[12px]">{x.sr_no}</span>
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    <Badge tone={srTone[x.status] ?? "neutral"}>
                      {label(t.status.sr, x.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
