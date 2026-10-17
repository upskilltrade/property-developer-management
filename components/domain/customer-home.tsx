import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  KeyRound,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatDate, formatDateTime } from "@/lib/format";
import { srTone } from "@/lib/handover";
import { defectTone } from "@/lib/site";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export type HomeHandover = {
  status: string;
  inspectionAt: string | null;
  handoverDate: string | null;
  items: { id: string; kind: string; description: string; url: string | null }[];
  acknowledgementUrl: string | null;
};
export type HomeWarranty = { id: string; name: string; endDate: string; active: boolean };
export type HomeService = {
  id: string;
  srNo: string;
  title: string;
  status: string;
  resolution: string | null;
  createdAt: string;
};
export type HomeDefect = {
  id: string;
  defectNo: string;
  title: string;
  location: string | null;
  status: string;
};

/**
 * Homeowner mode: after handover the unit card leads with handover documents, warranties and
 * repairs. Before that, during customer inspection, it shows the appointment, the observations
 * and the accept button.
 */
export function CustomerHome({
  t,
  locale,
  unitId,
  handover,
  warranties,
  services,
  defects,
  actions,
}: {
  t: Pick<Dictionary, "portal" | "status">;
  locale: Locale;
  unitId: string;
  handover: HomeHandover;
  warranties: HomeWarranty[];
  services: HomeService[];
  defects: HomeDefect[];
  actions: {
    reportObservation: (fd: FormData) => Promise<void>;
    acceptHome: (fd: FormData) => Promise<void>;
    requestService: (fd: FormData) => Promise<void>;
    confirmService: (fd: FormData) => Promise<void>;
  };
}) {
  const c = t.portal.customer;
  const hidden = { locale, unit_id: unitId };

  if (handover.status === "CUSTOMER_INSPECTION" || handover.status === "ACCEPTED") {
    const openObservations = defects.filter((d) => d.status !== "VERIFIED").length;
    return (
      <Panel
        title={c.inspection}
        description={
          handover.inspectionAt
            ? `${c.inspectionAt}: ${formatDateTime(locale, handover.inspectionAt)}`
            : undefined
        }
        actions={
          handover.status === "CUSTOMER_INSPECTION" ? (
            <Sheet
              title={c.logObservation}
              triggerLabel={c.logObservation}
              triggerIcon={<ClipboardCheck />}
              triggerVariant="secondary"
              triggerSize="xs"
            >
              <form action={actions.reportObservation} className="space-y-3">
                <Hidden values={hidden} />
                <Field label={c.observationTitle} required>
                  <Input name="title" required />
                </Field>
                <Field label={c.observationLocation}>
                  <Input name="location" />
                </Field>
                <Field label={c.serviceDetail}>
                  <Textarea name="description" />
                </Field>
                <SheetFooter>
                  <SubmitButton>{c.logObservation}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          ) : null
        }
      >
        {defects.length ? (
          <>
            <p className="border-b border-line bg-subtle px-4 py-1.5 text-2xs font-medium text-muted">
              {c.observations}
            </p>
            <ul className="divide-y divide-line">
              {defects.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    {d.title}
                    {d.location ? (
                      <span className="text-2xs text-muted"> · {d.location}</span>
                    ) : null}
                  </span>
                  <Badge tone={defectTone[d.status] ?? "neutral"}>
                    {label(t.status.defect, d.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="border-t border-line px-4 py-3 text-[13px]">
          {handover.status === "ACCEPTED" ? (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="size-4" />
              {c.accepted}
            </p>
          ) : (
            <form action={actions.acceptHome} className="flex flex-wrap items-center gap-3">
              <Hidden values={hidden} />
              <p className="min-w-0 flex-1 text-2xs text-muted">{c.acceptHint}</p>
              <SubmitButton variant="success" disabled={openObservations > 0}>
                {c.acceptHome}
              </SubmitButton>
            </form>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="size-4 text-brand" />
            {c.homeowner}
          </span>
        }
        description={
          handover.handoverDate
            ? `${c.handedOverOn} ${formatDate(locale, handover.handoverDate)}`
            : undefined
        }
      >
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-1 text-2xs font-medium text-muted">
              <ShieldCheck className="size-3.5" />
              {c.warranties}
            </p>
            <ul className="space-y-1 text-[13px]">
              {warranties.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span>{w.name}</span>
                  <Badge tone={w.active ? "success" : "neutral"}>
                    {c.warrantyUntil} {formatDate(locale, w.endDate)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-2xs font-medium text-muted">
              <FileText className="size-3.5" />
              {c.handoverDocs}
            </p>
            <ul className="space-y-1 text-[13px]">
              {handover.acknowledgementUrl ? (
                <li>
                  <a
                    href={handover.acknowledgementUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    {c.handoverDocs} (PDF)
                  </a>
                </li>
              ) : null}
              {handover.items.map((i) => (
                <li key={i.id}>
                  {label(t.status.itemKind, i.kind)} · {i.description}
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noreferrer" className="ml-1 text-brand">
                      <FileText className="inline size-3" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel
        title={c.service}
        actions={
          <Sheet
            title={c.newService}
            triggerLabel={c.newService}
            triggerIcon={<Wrench />}
            triggerSize="xs"
          >
            <form action={actions.requestService} className="space-y-3">
              <Hidden values={hidden} />
              <Field label={c.serviceTitle} required>
                <Input name="title" required />
              </Field>
              <Field label={c.serviceLocation}>
                <Input name="location" />
              </Field>
              <Field label={c.serviceDetail} required>
                <Textarea name="description" required />
              </Field>
              {warranties.length ? (
                <Field label={c.serviceWarranty}>
                  <Select name="warranty_id" defaultValue="">
                    <option value="">—</option>
                    {warranties.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <SheetFooter>
                <SubmitButton>{c.newService}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {services.length ? (
          <ul className="divide-y divide-line">
            {services.map((s) => (
              <li key={s.id} className="space-y-1.5 px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px]">{s.srNo}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                  <Badge tone={srTone[s.status] ?? "neutral"}>{label(t.status.sr, s.status)}</Badge>
                </div>
                <p className="text-2xs text-muted">{formatDate(locale, s.createdAt)}</p>
                {s.resolution ? (
                  <p className="text-2xs whitespace-pre-line text-emerald-700">{s.resolution}</p>
                ) : null}
                {s.status === "RESOLVED" ? (
                  <form
                    action={actions.confirmService}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <Hidden values={{ locale, sr_id: s.id }} />
                    <Input
                      name="note"
                      placeholder={c.notFixedReason}
                      className="h-7 min-w-40 flex-1 text-2xs"
                    />
                    <SubmitButton size="xs" variant="success" name="action" value="CLOSE">
                      {c.confirmFixed}
                    </SubmitButton>
                    <SubmitButton size="xs" variant="secondary" name="action" value="REOPEN">
                      {c.notFixed}
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
    </div>
  );
}
