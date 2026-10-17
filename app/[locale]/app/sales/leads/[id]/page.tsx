import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Lock, MessageSquare, Pencil, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime, formatMoney, today } from "@/lib/format";
import { activityKinds, bookingTone, localDateTime, manualStages, stageTone } from "@/lib/sales";
import { loadSalesRefs } from "@/lib/sales-data";
import { DetailList, Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadForm } from "@/components/domain/lead-form";
import {
  addActivity,
  cancelBooking,
  createBooking,
  holdUnit,
  releaseHold,
  scheduleViewing,
  setLeadStage,
  setViewingStatus,
  updateLead,
} from "../../actions";

export const metadata: Metadata = { title: "Lead" };

const viewingTone: Record<string, "info" | "success" | "danger" | "neutral"> = {
  SCHEDULED: "info",
  DONE: "success",
  NO_SHOW: "danger",
  CANCELLED: "neutral",
};

/** One lead: contact details, activity log, viewings, unit holds and booking. */
export default async function LeadDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const s = t.sales;
  const f = s.fields;
  const back = `/${locale}/app/sales/leads/${id}`;

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "*,projects(code,name),assignee:profiles!leads_assigned_to_fkey(display_name),interested:units!leads_interested_unit_id_fkey(code)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  await supabase.rpc("expire_unit_holds", { target_project: lead.project_id });
  const [refs, { data: activities }, { data: viewings }, { data: holds }, { data: bookings }] =
    await Promise.all([
      loadSalesRefs(supabase),
      supabase
        .from("lead_activities")
        .select(
          "id,kind,note,occurred_at,author:profiles!lead_activities_created_by_fkey(display_name)",
        )
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false })
        .limit(200),
      supabase
        .from("viewings")
        .select("id,scheduled_at,status,note,units(code)")
        .eq("lead_id", id)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("unit_holds")
        .select("id,unit_id,expires_at,status,note,created_at,units(code)")
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("bookings")
        .select(
          "id,booking_no,booking_date,unit_id,list_price,agreed_price,booking_amount,discount_reason,status,units(code)",
        )
        .eq("lead_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const project = one(lead.projects);
  const closed = lead.stage === "BOOKED" || lead.stage === "LOST";
  const projectUnits = refs.units.filter((u) => u.project_id === lead.project_id);
  const myHeld = new Set((holds ?? []).filter((h) => h.status === "ACTIVE").map((h) => h.unit_id));
  const holdable = projectUnits.filter((u) => u.status === "AVAILABLE");
  const bookable = projectUnits.filter((u) => u.status === "AVAILABLE" || myHeld.has(u.id));
  const activeBooking = (bookings ?? []).find((b) => b.status !== "CANCELLED");
  const defaultUnit =
    bookable.find((u) => myHeld.has(u.id)) ??
    bookable.find((u) => u.id === lead.interested_unit_id) ??
    bookable[0];
  const unitHref = (unitId: string) => `/${locale}/app/projects/${lead.project_id}/units/${unitId}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{lead.full_name}</h2>
          <p className="text-2xs text-muted">
            <span className="font-mono">{lead.lead_no}</span> · {project?.code} {project?.name}
          </p>
        </div>
        <Badge tone={stageTone[lead.stage] ?? "neutral"}>
          {label(t.status.leadStage, lead.stage)}
        </Badge>
        <Sheet
          title={s.editLead}
          triggerLabel={s.editLead}
          triggerIcon={<Pencil />}
          triggerVariant="secondary"
        >
          <LeadForm
            t={t}
            locale={locale}
            action={updateLead}
            returnTo={back}
            projects={refs.projects}
            units={projectUnits}
            members={refs.members}
            lead={lead}
          />
        </Sheet>
        {!closed && bookable.length ? (
          <Sheet
            title={s.book}
            description={s.bookHint}
            triggerLabel={s.book}
            triggerIcon={<Receipt />}
          >
            <form action={createBooking} className="space-y-3">
              <Hidden values={{ locale, return_to: back, lead_id: lead.id }} />
              <Field label={f.unit} required>
                <Select name="unit_id" required defaultValue={defaultUnit?.id}>
                  {bookable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                      {u.list_price ? ` · ${formatMoney(locale, u.list_price)}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <FormGrid>
                <Field
                  label={s.agreedPrice}
                  required
                  hint={`${s.listPrice}: ${formatMoney(locale, defaultUnit?.list_price)}`}
                >
                  <Input
                    name="agreed_price"
                    type="number"
                    min="1"
                    step="any"
                    required
                    defaultValue={defaultUnit?.list_price ?? ""}
                  />
                </Field>
                <Field label={s.bookingAmount}>
                  <Input name="booking_amount" type="number" min="0" step="any" defaultValue="0" />
                </Field>
              </FormGrid>
              <Field label={s.bookingDate}>
                <Input name="booking_date" type="date" defaultValue={today()} />
              </Field>
              <Field label={s.discountReason}>
                <Textarea name="discount_reason" />
              </Field>
              <SheetFooter>
                <SubmitButton>{s.book}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {activeBooking ? (
            <Panel
              title={`${s.bookingNo} ${activeBooking.booking_no}`}
              actions={
                <Badge tone={bookingTone[activeBooking.status] ?? "neutral"}>
                  {label(t.status.booking, activeBooking.status)}
                </Badge>
              }
            >
              <DetailList
                items={[
                  {
                    label: f.unit,
                    value: (
                      <Link
                        href={unitHref(activeBooking.unit_id)}
                        className="text-brand hover:underline"
                      >
                        {one(activeBooking.units)?.code} · {s.openUnit}
                      </Link>
                    ),
                  },
                  { label: s.bookingDate, value: formatDate(locale, activeBooking.booking_date) },
                  { label: s.listPrice, value: formatMoney(locale, activeBooking.list_price) },
                  { label: s.agreedPrice, value: formatMoney(locale, activeBooking.agreed_price) },
                  {
                    label: s.bookingAmount,
                    value: formatMoney(locale, activeBooking.booking_amount),
                  },
                  ...(activeBooking.discount_reason
                    ? [{ label: s.discountReason, value: activeBooking.discount_reason }]
                    : []),
                ]}
              />
              <form
                action={cancelBooking}
                className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3"
              >
                <Hidden values={{ locale, return_to: back, booking_id: activeBooking.id }} />
                <Field label={s.cancelReason} className="min-w-56 flex-1">
                  <Input name="reason" required />
                </Field>
                <SubmitButton variant="danger">{s.cancel}</SubmitButton>
              </form>
            </Panel>
          ) : null}

          <Panel title={s.activities}>
            {!closed || lead.stage === "BOOKED" ? (
              <form
                action={addActivity}
                className="flex flex-wrap items-end gap-2 border-b border-line bg-subtle px-4 py-3"
              >
                <Hidden values={{ locale, return_to: back, lead_id: lead.id }} />
                <Field label={s.activityKind} className="w-32">
                  <Select name="kind" defaultValue="CALL">
                    {activityKinds.map((k) => (
                      <option key={k} value={k}>
                        {t.status.leadActivity[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={s.activityNote} className="min-w-56 flex-1">
                  <Input name="note" required />
                </Field>
                <SubmitButton>{s.addActivity}</SubmitButton>
              </form>
            ) : null}
            {activities?.length ? (
              <ol className="divide-y divide-line">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-2.5 text-[13px]">
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">{label(t.status.leadActivity, a.kind)}</span>
                        {a.note ? <span className="text-ink-2"> — {a.note}</span> : null}
                      </p>
                      <p className="text-2xs text-muted">
                        {formatDateTime(locale, a.occurred_at)}
                        {one(a.author)?.display_name ? ` · ${one(a.author)?.display_name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={<MessageSquare />} title={s.noActivities} />
            )}
          </Panel>

          <Panel
            title={s.viewings}
            actions={
              !closed ? (
                <Sheet
                  title={s.scheduleViewing}
                  triggerLabel={s.scheduleViewing}
                  triggerIcon={<CalendarClock />}
                  triggerVariant="secondary"
                  triggerSize="xs"
                >
                  <form action={scheduleViewing} className="space-y-3">
                    <Hidden values={{ locale, return_to: back, lead_id: lead.id }} />
                    <Field label={s.viewingAt} required>
                      <Input
                        name="scheduled_at"
                        type="datetime-local"
                        required
                        defaultValue={localDateTime(24)}
                      />
                    </Field>
                    <Field label={f.unit}>
                      <Select name="unit_id" defaultValue={lead.interested_unit_id ?? ""}>
                        <option value="">—</option>
                        {projectUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={f.notes}>
                      <Textarea name="note" />
                    </Field>
                    <SheetFooter>
                      <SubmitButton>{t.common.save}</SubmitButton>
                    </SheetFooter>
                  </form>
                </Sheet>
              ) : null
            }
          >
            {viewings?.length ? (
              <ul className="divide-y divide-line">
                {viewings.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {formatDateTime(locale, v.scheduled_at)}
                        {one(v.units)?.code ? (
                          <span className="text-muted"> · {one(v.units)?.code}</span>
                        ) : null}
                      </p>
                      {v.note ? <p className="text-2xs text-muted">{v.note}</p> : null}
                    </div>
                    <Badge tone={viewingTone[v.status] ?? "neutral"}>
                      {label(t.status.viewing, v.status)}
                    </Badge>
                    {v.status === "SCHEDULED" ? (
                      <div className="flex gap-1">
                        {(["DONE", "NO_SHOW", "CANCELLED"] as const).map((st) => (
                          <form key={st} action={setViewingStatus}>
                            <Hidden
                              values={{ locale, return_to: back, viewing_id: v.id, status: st }}
                            />
                            <SubmitButton
                              size="xs"
                              variant={st === "DONE" ? "success" : "secondary"}
                            >
                              {st === "DONE"
                                ? s.markDone
                                : st === "NO_SHOW"
                                  ? s.noShow
                                  : t.status.viewing.CANCELLED}
                            </SubmitButton>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CalendarClock />} title={s.noViewings} />
            )}
          </Panel>

          <Panel
            title={s.holds}
            actions={
              !closed && holdable.length ? (
                <Sheet
                  title={s.holdUnit}
                  description={s.holdHint}
                  triggerLabel={s.holdUnit}
                  triggerIcon={<Lock />}
                  triggerVariant="secondary"
                  triggerSize="xs"
                >
                  <form action={holdUnit} className="space-y-3">
                    <Hidden values={{ locale, return_to: back, lead_id: lead.id }} />
                    <Field label={f.unit} required>
                      <Select
                        name="unit_id"
                        required
                        defaultValue={
                          holdable.find((u) => u.id === lead.interested_unit_id)?.id ??
                          holdable[0]?.id
                        }
                      >
                        {holdable.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                            {u.list_price ? ` · ${formatMoney(locale, u.list_price)}` : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={s.holdUntil} required>
                      <Input
                        name="expires_at"
                        type="datetime-local"
                        required
                        defaultValue={localDateTime(72)}
                      />
                    </Field>
                    <Field label={f.notes}>
                      <Textarea name="note" />
                    </Field>
                    <SheetFooter>
                      <SubmitButton>{s.holdUnit}</SubmitButton>
                    </SheetFooter>
                  </form>
                </Sheet>
              ) : null
            }
          >
            {holds?.length ? (
              <ul className="divide-y divide-line">
                {holds.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={unitHref(h.unit_id)}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {one(h.units)?.code}
                      </Link>
                      <p className="text-2xs text-muted">
                        {s.expires}: {formatDateTime(locale, h.expires_at)}
                        {h.note ? ` · ${h.note}` : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        h.status === "ACTIVE"
                          ? "warning"
                          : h.status === "CONVERTED"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {label(t.status.hold, h.status)}
                    </Badge>
                    {h.status === "ACTIVE" ? (
                      <form action={releaseHold}>
                        <Hidden values={{ locale, return_to: back, hold_id: h.id }} />
                        <SubmitButton size="xs" variant="secondary">
                          {s.release}
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Lock />} title="—" />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={f.leadNo + " " + lead.lead_no}>
            <DetailList
              items={[
                { label: f.phone, value: lead.phone ?? "—" },
                { label: f.email, value: lead.email ?? "—" },
                { label: f.line, value: lead.line_id ?? "—" },
                {
                  label: f.source,
                  value: `${label(t.status.leadSource, lead.source)}${lead.campaign ? ` · ${lead.campaign}` : ""}`,
                },
                { label: f.budget, value: lead.budget ? formatMoney(locale, lead.budget) : "—" },
                { label: f.interestedUnit, value: one(lead.interested)?.code ?? "—" },
                { label: f.assignedTo, value: one(lead.assignee)?.display_name ?? "—" },
                { label: f.lastActivity, value: formatDateTime(locale, lead.last_activity_at) },
                ...(lead.lost_reason ? [{ label: s.lostReason, value: lead.lost_reason }] : []),
                ...(lead.notes ? [{ label: f.notes, value: lead.notes }] : []),
              ]}
            />
          </Panel>
          {lead.stage !== "BOOKED" ? (
            <Panel title={s.changeStage}>
              <form action={setLeadStage} className="space-y-3 px-4 py-3">
                <Hidden values={{ locale, return_to: back, lead_id: lead.id }} />
                <Field label={f.stage}>
                  <Select name="stage" defaultValue={lead.stage}>
                    {manualStages.map((st) => (
                      <option key={st} value={st}>
                        {t.status.leadStage[st]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={s.lostReason}>
                  <Input name="reason" />
                </Field>
                <SubmitButton>{s.changeStage}</SubmitButton>
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
