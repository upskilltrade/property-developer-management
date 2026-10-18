import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitPullRequestArrow, MessageSquarePlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatNumber, toNumber } from "@/lib/format";
import { crSources, crTone, VO_VERSION_COLUMNS, voTone } from "@/lib/variations";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TFoot, TH, THead, TR } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { type VoItemRow } from "@/components/domain/vo-items-table";
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
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view === "register" ? "register" : "main";
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
  const tabs = (
    <Tabs
      active={view}
      items={[
        { key: "main", label: c.views.main, href: base },
        { key: "register", label: c.views.register, href: `${base}?view=register` },
      ]}
    />
  );

  if (view === "register") {
    // Approved = agreed with the buyer (or internally, for internal VOs); cancelled and rejected
    // VOs drop out. Each VO counts at its approved version, otherwise its current draft.
    const isApproved = (v: { status: string; customer_facing: boolean }) =>
      ["CUSTOMER_APPROVED", "RELEASED", "CLOSED"].includes(v.status) ||
      (!v.customer_facing && v.status === "INTERNAL_APPROVED");
    const live = (vos ?? []).filter((v) => !["CANCELLED", "CUSTOMER_REJECTED"].includes(v.status));
    const picked = live
      .map((v) => {
        const approved = isApproved(v);
        const x = versionOf(
          v.id,
          approved ? (v.approved_version ?? v.current_version) : v.current_version,
        );
        return x ? { vo: v, approved, version: x } : null;
      })
      .filter(Boolean) as {
      vo: NonNullable<typeof vos>[number];
      approved: boolean;
      version: NonNullable<typeof versions>[number];
    }[];
    const ids = picked.map((p) => p.version.id);
    const { data: itemRows } = ids.length
      ? await supabase
          .from("vo_items")
          .select("id,vo_version_id,seq,kind,description,quantity,unit,unit_price,amount")
          .in("vo_version_id", ids)
      : { data: [] };
    const items = (itemRows ?? []) as (VoItemRow & { vo_version_id: string })[];
    type Line = {
      key: string;
      voId: string;
      voNo: string;
      unitId: string | null;
      status: string;
      approved: boolean;
      kind: "ADD" | "OMIT";
      description: string;
      qty: string;
      amount: number;
    };
    const lines: Line[] = picked.flatMap((p) => {
      const own = items.filter((i) => i.vo_version_id === p.version.id);
      const base = {
        voId: p.vo.id,
        voNo: p.vo.vo_no,
        unitId: p.vo.unit_id,
        status: p.vo.status,
        approved: p.approved,
      };
      if (own.length)
        return own
          .sort((a, b) => a.seq - b.seq)
          .map((i) => ({
            ...base,
            key: i.id,
            kind: i.kind as "ADD" | "OMIT",
            description: i.description,
            qty: `${formatNumber(locale, i.quantity, 2)} ${i.unit ?? ""}`,
            amount: toNumber(i.amount),
          }));
      // No breakdown: the version's lump-sum price change stands in as one line.
      const lump = toNumber(p.version.price_delta);
      return lump
        ? [
            {
              ...base,
              key: p.version.id,
              kind: lump >= 0 ? "ADD" : "OMIT",
              description: `${p.vo.title} (${c.noItems})`,
              qty: "—",
              amount: Math.abs(lump),
            },
          ]
        : [];
    });
    const unitKeys = [...new Set(lines.map((l) => l.unitId ?? ""))].sort((a, b) =>
      (unitCode.get(a) ?? "~").localeCompare(unitCode.get(b) ?? "~"),
    );
    const total = (ls: Line[], kind?: "ADD" | "OMIT") =>
      ls
        .filter((l) => !kind || l.kind === kind)
        .reduce(
          (a, l) => a + (l.kind === "ADD" ? l.amount : -l.amount) * (kind === "OMIT" ? -1 : 1),
          0,
        );
    const rows = unitKeys.map((u) => {
      const ls = lines.filter((l) => (l.unitId ?? "") === u);
      const ap = ls.filter((l) => l.approved);
      return {
        unit: u,
        add: total(ap, "ADD"),
        omit: total(ap, "OMIT"),
        net: total(ap),
        pending: total(ls.filter((l) => !l.approved)),
        count: new Set(ls.map((l) => l.voId)).size,
      };
    });
    const sumRows = (k: "add" | "omit" | "net" | "pending") => rows.reduce((a, r) => a + r[k], 0);
    return (
      <div className="space-y-4">
        {tabs}
        <Panel title={c.views.register} description={c.registerHint}>
          {rows.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{c.unit}</TH>
                  <TH align="right">
                    {c.approved} · {c.totalAdd}
                  </TH>
                  <TH align="right">
                    {c.approved} · {c.totalOmit}
                  </TH>
                  <TH align="right">
                    {c.approved} · {c.net}
                  </TH>
                  <TH align="right">
                    {c.pending} · {c.net}
                  </TH>
                  <TH align="right">{c.voCount}</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.unit || "project"}>
                    <TD className="font-mono text-[12px]">
                      {r.unit ? unitCode.get(r.unit) : c.noUnit}
                    </TD>
                    <TD align="right" className="text-emerald-700 num">
                      +{formatMoney(locale, r.add)}
                    </TD>
                    <TD align="right" className="text-red-700 num">
                      −{formatMoney(locale, r.omit)}
                    </TD>
                    <TD align="right" className="font-semibold num">
                      {formatMoney(locale, r.net)}
                    </TD>
                    <TD align="right" className="text-muted num">
                      {formatMoney(locale, r.pending)}
                    </TD>
                    <TD align="right" className="num">
                      {r.count}
                    </TD>
                  </TR>
                ))}
              </tbody>
              <TFoot>
                <tr>
                  <TD className="font-medium">{c.net}</TD>
                  <TD align="right" className="font-semibold text-emerald-700 num">
                    +{formatMoney(locale, sumRows("add"))}
                  </TD>
                  <TD align="right" className="font-semibold text-red-700 num">
                    −{formatMoney(locale, sumRows("omit"))}
                  </TD>
                  <TD align="right" className="font-semibold num">
                    {formatMoney(locale, sumRows("net"))}
                  </TD>
                  <TD align="right" className="text-muted num">
                    {formatMoney(locale, sumRows("pending"))}
                  </TD>
                  <TD />
                </tr>
              </TFoot>
            </Table>
          ) : (
            <EmptyState icon={<GitPullRequestArrow />} title={c.noVariations} />
          )}
        </Panel>
        {lines.length ? (
          <Panel title={c.allItems}>
            <Table>
              <THead>
                <tr>
                  <TH>{c.voNo}</TH>
                  <TH>{c.unit}</TH>
                  <TH />
                  <TH>{c.itemDesc}</TH>
                  <TH align="right">{c.qty}</TH>
                  <TH align="right">{c.amount}</TH>
                  <TH>{t.common.status}</TH>
                </tr>
              </THead>
              <tbody>
                {lines.map((l) => (
                  <TR key={l.key}>
                    <TD>
                      <Link
                        href={`${base}/${l.voId}`}
                        className="font-mono text-[12px] font-semibold hover:text-brand hover:underline"
                      >
                        {l.voNo}
                      </Link>
                    </TD>
                    <TD className="font-mono text-[12px] text-muted">
                      {l.unitId ? unitCode.get(l.unitId) : c.noUnit}
                    </TD>
                    <TD>
                      <Badge tone={l.kind === "ADD" ? "success" : "danger"}>{c.kind[l.kind]}</Badge>
                    </TD>
                    <TD>{l.description}</TD>
                    <TD align="right" className="text-muted num">
                      {l.qty}
                    </TD>
                    <TD
                      align="right"
                      className={l.kind === "ADD" ? "text-emerald-700 num" : "text-red-700 num"}
                    >
                      {l.kind === "OMIT" ? "−" : "+"}
                      {formatMoney(locale, l.amount)}
                    </TD>
                    <TD>
                      <Badge tone={voTone[l.status] ?? "neutral"}>
                        {label(t.status.vo, l.status)}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Panel>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabs}
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
