import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleDashed, FilePen, Lock } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime, formatMoney } from "@/lib/format";
import { VO_VERSION_COLUMNS, voTone } from "@/lib/variations";
import { DetailList, Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { Field, Hidden, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { VariationForm } from "@/components/domain/variation-form";
import {
  approveVariation,
  closeVariation,
  linkDrawing,
  releaseVariation,
  reviseVariation,
  submitVariation,
} from "../actions";

export const metadata: Metadata = { title: "Variation order" };

/** One VO: every version with price/cost/time, approvals, release conditions and what release changed. */
export default async function VariationDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string; voId: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, voId } = await params;
  const { supabase } = await getSession(locale);
  const c = t.changes;
  const base = `/${locale}/app/projects/${id}/changes`;
  const back = `${base}/${voId}`;

  const { data: vo } = await supabase
    .from("variation_orders")
    .select(
      "*,units(code),change_requests(cr_no,title,source),partner_organizations(name),drawing_revisions(id,revision_code,status,drawings!drawing_revisions_drawing_id_fkey(drawing_no,title)),site_instructions(si_no,status),schedule_activities(code,verified_percent)",
    )
    .eq("id", voId)
    .eq("project_id", id)
    .maybeSingle();
  if (!vo) notFound();
  const [
    { data: versions },
    { data: costs },
    { data: approvals },
    { data: payment },
    { data: revisions },
    { data: partners },
  ] = await Promise.all([
    supabase
      .from("vo_versions")
      .select(VO_VERSION_COLUMNS)
      .eq("vo_id", voId)
      .order("version", { ascending: false }),
    supabase.rpc("vo_costs", { target_project: id }),
    supabase
      .from("vo_approvals")
      .select(
        "id,version,stage,decision,price_delta,time_delta_days,comment,decided_at,decider:profiles!vo_approvals_decided_by_fkey(display_name)",
      )
      .eq("vo_id", voId)
      .order("decided_at"),
    vo.payment_schedule_id
      ? supabase
          .from("payment_schedule_status")
          .select("amount,payment_status,due_date")
          .eq("id", vo.payment_schedule_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("drawing_revisions")
      .select(
        "id,revision_code,status,drawings!drawing_revisions_drawing_id_fkey(drawing_no,title)",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("partner_assignments")
      .select("partner_organizations(id,name)")
      .eq("project_id", id)
      .eq("status", "ACTIVE"),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const cost = (v: number) =>
    ((costs ?? []) as { vo_id: string; version: number; cost_delta: number }[]).find(
      (x) => x.vo_id === voId && x.version === v,
    )?.cost_delta;
  const current = (versions ?? []).find((x) => x.version === vo.current_version);
  const drawing = one(vo.drawing_revisions);
  const partnerOptions = [
    ...new Map(
      (partners ?? [])
        .map((p) => one(p.partner_organizations))
        .filter(Boolean)
        .map((p) => [p!.id, { id: p!.id, label: p!.name }]),
    ).values(),
  ];
  const ctx = { locale, return_to: back, vo_id: vo.id };
  const editable = vo.status === "DRAFT" || vo.status === "CUSTOMER_REJECTED";
  const releasable = vo.status === "INTERNAL_APPROVED" || vo.status === "CUSTOMER_APPROVED";
  const paymentOk =
    !vo.requires_payment_before_release ||
    !vo.payment_schedule_id ||
    payment?.payment_status === "PAID";
  const drawingOk = !drawing || drawing.status === "RELEASED";
  const check = (ok: boolean, text: string) => (
    <span
      className={cn("inline-flex items-center gap-1", ok ? "text-emerald-700" : "text-amber-700")}
    >
      {ok ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      {text}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={base} className={buttonClass("ghost", "sm", "-ml-2 px-2")}>
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            <span className="font-mono">{vo.vo_no}</span> · {vo.title}
          </h2>
          <p className="text-2xs text-muted">
            {one(vo.units)?.code ?? c.noUnit}
            {one(vo.change_requests) ? ` · ${one(vo.change_requests)?.cr_no}` : ""} ·{" "}
            {vo.customer_facing ? c.customerFacing : c.internal}
          </p>
        </div>
        <Badge tone={voTone[vo.status] ?? "neutral"}>{label(t.status.vo, vo.status)}</Badge>
        {editable ? (
          <>
            <Sheet
              title={c.revise}
              description={c.reviseHint}
              triggerLabel={c.revise}
              triggerIcon={<FilePen />}
              triggerVariant="secondary"
              width="lg"
            >
              <VariationForm
                t={t}
                action={reviseVariation}
                hidden={ctx}
                units={[]}
                partners={partnerOptions}
                values={{
                  original_scope: current?.original_scope,
                  revised_scope: current?.revised_scope,
                  price_delta: current?.price_delta,
                  cost_delta: cost(vo.current_version),
                  time_delta_days: current?.time_delta_days,
                  partner_id: vo.partner_id,
                  requires_payment_before_release: vo.requires_payment_before_release,
                }}
                revise
                submitLabel={c.revise}
              />
            </Sheet>
            {vo.status === "DRAFT" ? (
              <form action={submitVariation}>
                <Hidden values={ctx} />
                <SubmitButton>{c.submit}</SubmitButton>
              </form>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {vo.status === "PENDING_INTERNAL" ? (
            <Panel title={c.approve}>
              <form action={approveVariation} className="flex flex-wrap items-end gap-2 px-4 py-3">
                <Hidden values={ctx} />
                <Field label={c.reason} className="min-w-56 flex-1">
                  <Input name="comment" />
                </Field>
                <SubmitButton variant="success" name="decision" value="approve">
                  {c.approve}
                </SubmitButton>
                <SubmitButton variant="danger" name="decision" value="reject">
                  {c.reject}
                </SubmitButton>
              </form>
            </Panel>
          ) : null}

          {releasable ? (
            <Panel title={c.conditions} description={c.releaseHint}>
              <div className="space-y-1.5 px-4 py-3 text-[13px]">
                <p>
                  {c.paymentStatus}:{" "}
                  {check(
                    paymentOk,
                    !vo.requires_payment_before_release || !vo.payment_schedule_id
                      ? c.notRequired
                      : payment?.payment_status === "PAID"
                        ? c.paid
                        : `${c.unpaid} ${formatMoney(locale, payment?.amount)}`,
                  )}
                </p>
                <p>
                  {c.drawingStatus}:{" "}
                  {check(
                    drawingOk,
                    drawing
                      ? `${one(drawing.drawings)?.drawing_no} rev ${drawing.revision_code} · ${label(t.status.drawingStatus, drawing.status)}`
                      : c.noDrawing,
                  )}
                </p>
              </div>
              <form action={releaseVariation} className="border-t border-line px-4 py-3">
                <Hidden values={ctx} />
                <SubmitButton variant="success" disabled={!paymentOk || !drawingOk}>
                  {c.release}
                </SubmitButton>
              </form>
            </Panel>
          ) : null}

          <Panel title={c.versions}>
            <ol className="divide-y divide-line">
              {(versions ?? []).map((x) => {
                const approved = vo.approved_version === x.version;
                return (
                  <li
                    key={x.id}
                    className={cn(
                      "space-y-2 px-4 py-3 text-[13px]",
                      approved && "bg-emerald-50/60",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">
                        {c.version} {x.version}
                      </span>
                      {approved ? (
                        <Badge tone="success">
                          <Lock className="size-3" /> {c.approve}
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-2xs text-muted">
                        {formatDateTime(locale, x.created_at)}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-2xs text-muted">{c.originalScope}</p>
                        <p className="whitespace-pre-line">{x.original_scope}</p>
                      </div>
                      <div>
                        <p className="text-2xs text-muted">{c.revisedScope}</p>
                        <p className="whitespace-pre-line font-medium">{x.revised_scope}</p>
                      </div>
                    </div>
                    <dl className="grid gap-2 text-[12px] sm:grid-cols-3">
                      <div>
                        <dt className="text-muted">{c.priceDelta}</dt>
                        <dd className="font-medium num">{formatMoney(locale, x.price_delta)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{c.costDelta}</dt>
                        <dd className="num">{formatMoney(locale, cost(x.version))}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{c.timeDelta}</dt>
                        <dd className="num">{x.time_delta_days}</dd>
                      </div>
                    </dl>
                    {x.note ? <p className="text-2xs text-muted">{x.note}</p> : null}
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={c.approvals}>
            {approvals?.length ? (
              <ul className="divide-y divide-line">
                {approvals.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {a.stage === "INTERNAL" ? c.internal : c.customer}
                      </span>
                      <span className="text-2xs text-muted">v{a.version}</span>
                      <Badge
                        tone={a.decision === "APPROVED" ? "success" : "danger"}
                        className="ml-auto"
                      >
                        {a.decision === "APPROVED" ? c.approve : c.reject}
                      </Badge>
                    </div>
                    <p className="text-2xs text-muted">
                      {formatMoney(locale, a.price_delta)} · {a.time_delta_days} d ·{" "}
                      {one(a.decider)?.display_name ?? "—"} · {formatDateTime(locale, a.decided_at)}
                    </p>
                    {a.comment ? <p className="text-ink-2">{a.comment}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-2xs text-faint">—</p>
            )}
          </Panel>

          <Panel title={c.linked}>
            <DetailList
              items={[
                { label: c.partner, value: one(vo.partner_organizations)?.name ?? "—" },
                {
                  label: c.drawing,
                  value: drawing
                    ? `${one(drawing.drawings)?.drawing_no} rev ${drawing.revision_code}`
                    : "—",
                },
                {
                  label: c.paymentSchedule,
                  value: payment
                    ? `${formatMoney(locale, payment.amount)} · ${payment.payment_status}`
                    : "—",
                },
                {
                  label: c.siteInstruction,
                  value: one(vo.site_instructions)
                    ? `${one(vo.site_instructions)?.si_no} · ${label(t.status.si, one(vo.site_instructions)?.status)}`
                    : "—",
                },
                {
                  label: c.scheduleActivity,
                  value: one(vo.schedule_activities)
                    ? `${one(vo.schedule_activities)?.code} · ${Number(one(vo.schedule_activities)?.verified_percent ?? 0)}%`
                    : "—",
                },
              ]}
            />
            {!["RELEASED", "CLOSED", "CANCELLED"].includes(vo.status) ? (
              <form
                action={linkDrawing}
                className="flex items-end gap-2 border-t border-line px-4 py-3"
              >
                <Hidden values={ctx} />
                <Field label={c.linkDrawing} className="flex-1">
                  <Select name="revision_id" defaultValue={vo.drawing_revision_id ?? ""}>
                    <option value="">—</option>
                    {(revisions ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {one(r.drawings)?.drawing_no} rev {r.revision_code} ·{" "}
                        {label(t.status.drawingStatus, r.status)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton size="sm" variant="secondary">
                  {t.common.save}
                </SubmitButton>
              </form>
            ) : null}
          </Panel>

          {vo.status === "RELEASED" ? (
            <form action={closeVariation} className="flex justify-end">
              <Hidden values={{ ...ctx, mode: "close" }} />
              <SubmitButton variant="secondary">{c.close}</SubmitButton>
            </form>
          ) : null}
          {!["RELEASED", "CLOSED", "CANCELLED"].includes(vo.status) ? (
            <Panel title={c.cancel}>
              <form action={closeVariation} className="flex items-end gap-2 px-4 py-3">
                <Hidden values={{ ...ctx, mode: "cancel" }} />
                <Field label={c.reason} required className="flex-1">
                  <Input name="reason" required />
                </Field>
                <SubmitButton variant="danger">{c.cancel}</SubmitButton>
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
