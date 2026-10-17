import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime } from "@/lib/format";
import { rfiTone, siTone } from "@/lib/site";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, Hidden, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { closeRfi, issueInstruction, respondRfi } from "../../actions";

export const metadata: Metadata = { title: "RFI" };

/** RFI with its append-only thread; answering, closing, and issuing a site instruction from it. */
export default async function RfiDetail({
  params,
}: {
  params: Promise<{ locale: string; id: string; rfiId: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, rfiId } = await params;
  const { supabase } = await getSession(locale);
  const s = t.site;
  const base = `/${locale}/app/projects/${id}/site`;
  const back = `${base}/rfis/${rfiId}`;

  const { data: rfi } = await supabase
    .from("rfis")
    .select(
      "*,units(code),partner_organizations(name),raiser:profiles!rfis_raised_by_fkey(display_name)",
    )
    .eq("id", rfiId)
    .eq("project_id", id)
    .maybeSingle();
  if (!rfi) notFound();
  const [{ data: responses }, { data: instructions }] = await Promise.all([
    supabase
      .from("rfi_responses")
      .select(
        "id,body,is_answer,responder_partner_id,created_at,author:profiles!rfi_responses_responded_by_fkey(display_name)",
      )
      .eq("rfi_id", rfiId)
      .order("created_at"),
    supabase.from("site_instructions").select("id,si_no,title,status").eq("rfi_id", rfiId),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const partner = one(rfi.partner_organizations);
  const ctx = { locale, return_to: back, rfi_id: rfi.id, project_id: id };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${base}?view=rfis`} className={buttonClass("ghost", "sm", "-ml-2 px-2")}>
          <ArrowLeft />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">
            <span className="font-mono">{rfi.rfi_no}</span> · {rfi.subject}
          </h2>
          <p className="text-2xs text-muted">
            {partner?.name ?? s.internal}
            {one(rfi.units)?.code ? ` · ${one(rfi.units)?.code}` : ""} ·{" "}
            {formatDate(locale, rfi.created_at)}
            {rfi.due_date ? ` · ${s.dueDate} ${formatDate(locale, rfi.due_date)}` : ""}
          </p>
        </div>
        <Badge tone={rfiTone[rfi.status] ?? "neutral"}>{label(t.status.rfi, rfi.status)}</Badge>
        {rfi.status === "ANSWERED" ? (
          <form action={closeRfi}>
            <Hidden values={ctx} />
            <SubmitButton variant="secondary">{s.closeRfi}</SubmitButton>
          </form>
        ) : null}
        {rfi.partner_id && rfi.status !== "CLOSED" ? (
          <Sheet title={s.issueSi} triggerLabel={s.issueSi} triggerVariant="secondary">
            <form action={issueInstruction} className="space-y-3">
              <Hidden values={{ ...ctx, partner_id: rfi.partner_id, unit_id: rfi.unit_id ?? "" }} />
              <Field label={s.title} required>
                <Input name="title" required defaultValue={rfi.subject} />
              </Field>
              <Field label={s.instruction} required>
                <Textarea name="instruction" required />
              </Field>
              <SheetFooter>
                <SubmitButton>{s.issueSi}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={s.thread} className="lg:col-span-2">
          <ol className="space-y-3 p-4">
            <li className="rounded-md border border-line bg-subtle p-3 text-[13px]">
              <p className="text-2xs text-muted">
                {s.question} · {one(rfi.raiser)?.display_name ?? "—"} ·{" "}
                {formatDateTime(locale, rfi.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-line">{rfi.question}</p>
            </li>
            {(responses ?? []).map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border p-3 text-[13px]",
                  r.is_answer ? "border-emerald-300 bg-emerald-50/60" : "border-line",
                  r.responder_partner_id ? "mr-8" : "ml-8",
                )}
              >
                <p className="text-2xs text-muted">
                  {r.is_answer ? (
                    <Badge tone="success" className="mr-1">
                      {s.answer}
                    </Badge>
                  ) : null}
                  {one(r.author)?.display_name ?? "—"} · {formatDateTime(locale, r.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-line">{r.body}</p>
              </li>
            ))}
          </ol>
          {rfi.status !== "CLOSED" ? (
            <form action={respondRfi} className="space-y-2 border-t border-line px-4 py-3">
              <Hidden values={ctx} />
              <Field label={s.reply} required>
                <Textarea name="body" required />
              </Field>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="is_answer" defaultChecked />
                  {s.answer}
                </label>
                <SubmitButton>{s.respond}</SubmitButton>
              </div>
            </form>
          ) : null}
        </Panel>

        <Panel title={s.views.instructions}>
          {instructions?.length ? (
            <ul className="divide-y divide-line">
              {instructions.map((x) => (
                <li key={x.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                  <span className="font-mono text-[12px]">{x.si_no}</span>
                  <span className="truncate">{x.title}</span>
                  <Badge tone={siTone[x.status] ?? "neutral"} className="ml-auto">
                    {label(t.status.si, x.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-2xs text-faint">{s.noInstructions}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
