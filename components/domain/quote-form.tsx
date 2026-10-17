"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

type Supplier = { id: string; label: string; name: string };
type Extracted = {
  supplier_name: string | null;
  quote_ref: string | null;
  valid_until: string | null;
  lead_time_days: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  line_items: { description: string; amount: number | null }[];
  notes: string | null;
};
type Labels = {
  supplier: string;
  quoteRef: string;
  amount: string;
  leadTime: string;
  validUntil: string;
  note: string;
  submit: string;
  ai: {
    button: string;
    hint: string;
    reading: string;
    done: string;
    supplierFound: string;
    supplierMissing: string;
    vat: string;
    items: string;
    tooLarge: string;
    badType: string;
  };
  errors: Record<string, string>;
};

// Company-form words differ between documents and the supplier list; compare without them.
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(
      /บริษัท|จำกัด|\(มหาชน\)|มหาชน|ห้างหุ้นส่วน|หจก\.?|ร้าน|co\.?,?\s*ltd\.?|company|limited|ltd\.?|inc\.?/g,
      "",
    )
    .replace(/[\s.,()'"-]/g, "");

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Quotation form with optional AI pre-fill from the supplier's document. */
export function QuoteForm({
  action,
  hidden,
  suppliers,
  labels,
  extractUrl,
  aiEnabled,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  suppliers: Supplier[];
  labels: Labels;
  extractUrl: string;
  aiEnabled: boolean;
}) {
  const [partnerId, setPartnerId] = useState(suppliers[0]?.id ?? "");
  const [quoteRef, setQuoteRef] = useState("");
  const [amount, setAmount] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  async function readDocument(file: File) {
    if (file.size > 10 * 1024 * 1024) return setMessage({ text: labels.ai.tooLarge, error: true });
    if (!/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(file.type))
      return setMessage({ text: labels.ai.badType, error: true });
    setBusy(true);
    setMessage({ text: labels.ai.reading });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(extractUrl, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { quote?: Extracted; error?: string };
      if (!res.ok || !json.quote) {
        const key = json.error ?? "generic";
        return setMessage({
          text:
            key === "too_large"
              ? labels.ai.tooLarge
              : key === "bad_type"
                ? labels.ai.badType
                : (labels.errors[key] ?? labels.errors.generic),
          error: true,
        });
      }
      const q = json.quote;
      setExtracted(q);
      if (q.quote_ref) setQuoteRef(q.quote_ref);
      if (q.total_amount != null) setAmount(String(q.total_amount));
      if (q.lead_time_days != null) setLeadTime(String(Math.round(q.lead_time_days)));
      if (isoDate(q.valid_until)) setValidUntil(isoDate(q.valid_until));
      if (q.notes) setNotes(q.notes);
      const want = q.supplier_name ? normalize(q.supplier_name) : "";
      const match = want
        ? suppliers.find((s) => {
            const have = normalize(s.name);
            return have && (have.includes(want) || want.includes(have));
          })
        : undefined;
      if (match) setPartnerId(match.id);
      setMessage({
        text: `${labels.ai.done} · ${match ? `${labels.ai.supplierFound}: ${match.name}` : labels.ai.supplierMissing}`,
        error: !match,
      });
    } catch {
      setMessage({ text: labels.errors.generic, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={action} className="space-y-3">
      <Hidden values={hidden} />
      {aiEnabled ? (
        <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-violet-800">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {labels.ai.button}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readDocument(f);
                e.target.value = "";
              }}
            />
          </label>
          <p className="mt-1 text-2xs text-muted">{labels.ai.hint}</p>
          {message ? (
            <p
              className={
                message.error
                  ? "mt-1.5 text-2xs text-amber-800"
                  : "mt-1.5 text-2xs text-emerald-700"
              }
            >
              {message.text}
            </p>
          ) : null}
          {extracted?.line_items.length ? (
            <details className="mt-1.5 text-2xs text-muted">
              <summary className="cursor-pointer">
                {labels.ai.items} ({extracted.line_items.length})
                {extracted.vat_amount != null
                  ? ` · ${labels.ai.vat} ${extracted.vat_amount.toLocaleString()}`
                  : ""}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {extracted.line_items.slice(0, 30).map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{it.description}</span>
                    <span className="num">
                      {it.amount != null ? it.amount.toLocaleString() : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <FormGrid>
        <Field label={labels.supplier} required>
          <Select
            name="partner_id"
            required
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.quoteRef}>
          <Input name="quote_ref" value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label={labels.amount} required>
          <Input
            name="amount"
            type="number"
            min="1"
            step="any"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label={labels.leadTime}>
          <Input
            name="lead_time_days"
            type="number"
            min="0"
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
          />
        </Field>
        <Field label={labels.validUntil}>
          <Input
            name="valid_until"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
      </FormGrid>
      <Field label={labels.note}>
        <Textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <SheetFooter>
        <SubmitButton disabled={busy}>{labels.submit}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
