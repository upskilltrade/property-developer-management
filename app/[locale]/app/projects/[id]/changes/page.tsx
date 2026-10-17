import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitPullRequestArrow, MessageSquarePlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { crSources, crTone, VO_VERSION_COLUMNS, voTone } from "@/lib/variations";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { VariationForm } from "@/components/domain/variation-form";
import { createVariation, decideRequest, logRequest } from "./actions";

export const metadata: Metadata = { title: "Changes" };

/** Change control for one project: incoming change requests and the variation orders made from them. */
export default async function ProjectChanges({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const c = t.changes;
  const base = `/${locale}/app/projects/${id}/changes`;

  const { data: project } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) notFound();
  const [
    { data: units },
    { data: requests },
    { data: vos },
    { data: versions },
    { data: costs },
    { data: partners },
  ] = await Promise.all([
    supabase.from("units").select("id,code").eq("project_id", id).order("code"),
    supabase
      .from("change_requests")
      .select(
        "id,cr_no,source,title,description,status,unit_id,requested_by_customer,decision_note,created_at",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("variation_orders")
      .select(
        "id,vo_no,title,status,unit_id,customer_facing,current_version,approved_version,created_at",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("vo_versions").select(VO_VERSION_COLUMNS),
    supabase.rpc("vo_costs", { target_project: id }),
    supabase
      .from("partner_assignments")
      .select("partner_id,partner_organizations(id,name)")
      .eq("project_id", id)
      .eq("status", "ACTIVE"),
  ]);
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const partnerOptions = [
    ...new Map(
      (partners ?? [])
        .map((p) => one(p.partner_organizations))
        .filter(Boolean)
        .map((p) => [p!.id, { id: p!.id, label: p!.name }]),
    ).values(),
  ];
  const unitOptions = (units ?? []).map((u) => ({ id: u.id, label: u.code }));
  const versionOf = (voId: string, v: number) =>
    (versions ?? []).find((x) => x.vo_id === voId && x.version === v);
  const costOf = (voId: string, v: number) =>
    ((costs ?? []) as { vo_id: string; version: number; cost_delta: number }[]).find(
      (x) => x.vo_id === voId && x.version === v,
    )?.cost_delta;
  const ctx = { locale, return_to: base, project_id: id };

  return (
    <div className="space-y-4">
      <Panel
        title={c.requests}
        actions={
          <Sheet
            title={c.newRequest}
            triggerLabel={c.newRequest}
            triggerIcon={<MessageSquarePlus />}
            triggerVariant="secondary"
            triggerSize="xs"
          >
            <form action={logRequest} className="space-y-3">
              <Hidden values={ctx} />
              <FormGrid>
                <Field label={c.source}>
                  <Select name="source" defaultValue="SITE">
                    {crSources.map((s) => (
                      <option key={s} value={s}>
                        {t.status.crSource[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={c.unit}>
                  <Select name="unit_id" defaultValue="">
                    <option value="">{c.noUnit}</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <Field label={c.title} required>
                <Input name="title" required />
              </Field>
              <Field label={c.description} required>
                <Textarea name="description" required />
              </Field>
              <SheetFooter>
                <SubmitButton>{c.newRequest}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {requests?.length ? (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-mono text-[12px] font-semibold">{r.cr_no}</span> ·{" "}
                    {r.title}
                  </p>
                  <p className="text-ink-2">{r.description}</p>
                  <p className="text-2xs text-muted">
                    {label(t.status.crSource, r.source)} ·{" "}
                    {r.unit_id ? unitCode.get(r.unit_id) : c.noUnit} ·{" "}
                    {formatDate(locale, r.created_at)}
                    {r.decision_note ? ` · ${r.decision_note}` : ""}
                  </p>
                </div>
                <Badge tone={crTone[r.status] ?? "neutral"}>{label(t.status.cr, r.status)}</Badge>
                {r.status === "SUBMITTED" || r.status === "UNDER_REVIEW" ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <Sheet
                      title={`${c.convert} · ${r.cr_no}`}
                      triggerLabel={c.convert}
                      triggerSize="xs"
                      width="lg"
                    >
                      <VariationForm
                        t={t}
                        action={createVariation}
                        hidden={{ ...ctx, change_request_id: r.id }}
                        units={unitOptions}
                        partners={partnerOptions}
                        values={{
                          title: r.title,
                          unit_id: r.unit_id,
                          original_scope: r.description,
                          customer_facing: r.source === "CUSTOMER",
                        }}
                        submitLabel={c.convert}
                      />
                    </Sheet>
                    <form action={decideRequest} className="flex items-center gap-1">
                      <Hidden values={{ ...ctx, cr_id: r.id }} />
                      {r.status === "SUBMITTED" ? (
                        <SubmitButton size="xs" variant="secondary" name="decision" value="REVIEW">
                          {c.review}
                        </SubmitButton>
                      ) : null}
                      <Input name="note" placeholder={c.reason} className="h-6 w-28 text-2xs" />
                      <SubmitButton size="xs" variant="danger" name="decision" value="REJECT">
                        {c.reject}
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<MessageSquarePlus />} title={c.noRequests} />
        )}
      </Panel>

      <Panel
        title={c.variations}
        actions={
          <Sheet title={c.newVariation} triggerLabel={c.newVariation} triggerSize="xs" width="lg">
            <VariationForm
              t={t}
              action={createVariation}
              hidden={ctx}
              units={unitOptions}
              partners={partnerOptions}
              submitLabel={c.newVariation}
            />
          </Sheet>
        }
      >
        {vos?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{c.voNo}</TH>
                <TH>{c.title}</TH>
                <TH>{c.unit}</TH>
                <TH align="right">{c.priceDelta}</TH>
                <TH align="right">{c.costDelta}</TH>
                <TH align="right">{c.timeDelta}</TH>
                <TH>{t.common.status}</TH>
              </tr>
            </THead>
            <tbody>
              {vos.map((v) => {
                const ver = v.approved_version ?? v.current_version;
                const x = versionOf(v.id, ver);
                return (
                  <TR key={v.id}>
                    <TD>
                      <Link
                        href={`${base}/${v.id}`}
                        className="font-mono text-[12px] font-semibold hover:text-brand hover:underline"
                      >
                        {v.vo_no}
                      </Link>
                      <p className="text-[10px] text-muted">v{ver}</p>
                    </TD>
                    <TD>
                      {v.title}
                      {!v.customer_facing ? (
                        <p className="text-[10px] text-muted">{c.internal}</p>
                      ) : null}
                    </TD>
                    <TD className="font-mono text-[12px] text-muted">
                      {v.unit_id ? unitCode.get(v.unit_id) : c.noUnit}
                    </TD>
                    <TD align="right">{formatMoney(locale, x?.price_delta)}</TD>
                    <TD align="right" className="text-muted">
                      {formatMoney(locale, costOf(v.id, ver))}
                    </TD>
                    <TD align="right" className="num">
                      {x?.time_delta_days ?? 0}
                    </TD>
                    <TD>
                      <Badge tone={voTone[v.status] ?? "neutral"}>
                        {label(t.status.vo, v.status)}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<GitPullRequestArrow />} title={c.noVariations} />
        )}
      </Panel>
    </div>
  );
}
