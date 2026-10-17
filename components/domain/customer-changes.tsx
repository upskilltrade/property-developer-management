import { GitPullRequestArrow } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import { crTone, voTone } from "@/lib/variations";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type CustomerRequest = {
  id: string;
  crNo: string;
  title: string;
  status: string;
  unitCode: string;
  createdAt: string;
};
export type CustomerOffer = {
  id: string;
  voNo: string;
  title: string;
  status: string;
  unitCode: string;
  version: number;
  revisedScope: string;
  priceDelta: number;
  timeDeltaDays: number;
};

/** Customer change requests and the variation offers to approve (each tied to the offered version). */
export function CustomerChanges({
  t,
  locale,
  units,
  requests,
  offers,
  requestAction,
  decideAction,
}: {
  t: Pick<Dictionary, "portal" | "status" | "changes">;
  locale: Locale;
  units: { id: string; code: string }[];
  requests: CustomerRequest[];
  offers: CustomerOffer[];
  requestAction: (fd: FormData) => Promise<void>;
  decideAction: (fd: FormData) => Promise<void>;
}) {
  const c = t.portal.customer;
  return (
    <Panel
      title={c.changes}
      description={c.changesHint}
      actions={
        <Sheet
          title={c.newRequest}
          triggerLabel={c.newRequest}
          triggerIcon={<GitPullRequestArrow />}
          triggerSize="xs"
        >
          <form action={requestAction} className="space-y-3">
            <Hidden values={{ locale }} />
            {units.length > 1 ? (
              <Field label={t.changes.unit}>
                <Select name="unit_id" defaultValue={units[0]?.id}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Hidden values={{ unit_id: units[0]?.id ?? "" }} />
            )}
            <Field label={c.requestTitle} required>
              <Input name="title" required />
            </Field>
            <Field label={c.requestDetail} required>
              <Textarea name="description" required />
            </Field>
            <SheetFooter>
              <SubmitButton>{c.newRequest}</SubmitButton>
            </SheetFooter>
          </form>
        </Sheet>
      }
    >
      {offers.length ? (
        <>
          <p className="border-b border-line bg-subtle px-4 py-1.5 text-2xs font-medium text-muted">
            {c.offers}
          </p>
          <ul className="divide-y divide-line">
            {offers.map((o) => (
              <li key={o.id} className="space-y-2 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">{o.voNo}</span>
                  <span className="font-medium">{o.title}</span>
                  <Badge tone={voTone[o.status] ?? "neutral"} className="ml-auto">
                    {label(t.status.vo, o.status)}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-ink-2">{o.revisedScope}</p>
                <p className="text-2xs text-muted">
                  {o.unitCode} · v{o.version} · {c.price}{" "}
                  <b className="text-ink num">{formatMoney(locale, o.priceDelta)}</b> · {c.days}{" "}
                  <b className="text-ink num">{o.timeDeltaDays}</b>
                </p>
                {o.status === "OFFERED" ? (
                  <form action={decideAction} className="flex flex-wrap items-center gap-1.5">
                    <Hidden values={{ locale, vo_id: o.id }} />
                    <Input
                      name="comment"
                      placeholder={c.rejectComment}
                      className="h-7 min-w-40 flex-1 text-2xs"
                    />
                    <SubmitButton size="xs" variant="success" name="decision" value="approve">
                      {c.acceptVo}
                    </SubmitButton>
                    <SubmitButton size="xs" variant="secondary" name="decision" value="reject">
                      {c.rejectVo}
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {requests.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
              <span className="font-mono text-[12px]">{r.crNo}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="text-2xs text-muted">{formatDate(locale, r.createdAt)}</span>
              <Badge tone={crTone[r.status] ?? "neutral"}>{label(t.status.cr, r.status)}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
