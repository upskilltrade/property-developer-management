"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { Hidden } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";

type Category = { id: string; code: string; name: string };
type Row = {
  include: boolean;
  section: string;
  item_code: string;
  description: string;
  uom: string;
  quantity: string;
  rate: string;
  /** Line total printed in the document, to catch misreads. */
  doc_amount: number | null;
  cost_category_id: string;
};
type Extracted = {
  title: string | null;
  lines: {
    section: string | null;
    item_code: string | null;
    description: string;
    uom: string | null;
    quantity: number | null;
    rate: number | null;
    amount: number | null;
    category_code: string | null;
  }[];
  total_amount: number | null;
  notes: string | null;
};
type Labels = {
  hint: string;
  aiButton: string;
  aiHint: string;
  csvButton: string;
  csvHint: string;
  reading: string;
  read: string;
  include: string;
  section: string;
  itemCode: string;
  description: string;
  category: string;
  pickCategory: string;
  uom: string;
  quantity: string;
  rate: string;
  amount: string;
  docAmount: string;
  mismatch: string;
  docTotal: string;
  ourTotal: string;
  totalMismatch: string;
  missingCategory: string;
  submit: string;
  tooLarge: string;
  badType: string;
  csvMissing: string;
  notes: string;
  errors: Record<string, string>;
};

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/[,\s]/g, "")));
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * BOQ import: read a BOQ document with AI, or a CSV, then review every line (category, quantity,
 * rate) before adding the lines to the draft budget version in one call.
 */
export function BoqImport({
  action,
  hidden,
  categories,
  extractUrl,
  aiEnabled,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  categories: Category[];
  extractUrl: string;
  aiEnabled: boolean;
  labels: Labels;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [docTotal, setDocTotal] = useState<number | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const byCode = useMemo(
    () => new Map(categories.map((c) => [c.code.toUpperCase(), c.id])),
    [categories],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function readDocument(file: File) {
    if (file.size > 20 * 1024 * 1024) return setMessage({ text: labels.tooLarge, error: true });
    if (!/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(file.type))
      return setMessage({ text: labels.badType, error: true });
    setBusy(true);
    setMessage({ text: labels.reading });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(extractUrl, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        boq?: Extracted;
        error?: string;
      };
      if (!res.ok || !json.boq) {
        const key = json.error ?? "generic";
        return setMessage({
          text:
            key === "too_large"
              ? labels.tooLarge
              : key === "bad_type"
                ? labels.badType
                : (labels.errors[key] ?? labels.errors.generic),
          error: true,
        });
      }
      const b = json.boq;
      setRows(
        b.lines.map((l) => ({
          include: true,
          section: l.section ?? "",
          item_code: l.item_code ?? "",
          description: l.description,
          uom: l.uom ?? "LS",
          quantity: l.quantity != null ? String(l.quantity) : "",
          rate: l.rate != null ? String(l.rate) : "",
          doc_amount: l.amount,
          cost_category_id: (l.category_code && byCode.get(l.category_code.toUpperCase())) || "",
        })),
      );
      setDocTotal(b.total_amount);
      setNotes(b.notes);
      setMessage({ text: labels.read.replace("{n}", String(b.lines.length)) });
    } catch {
      setMessage({ text: labels.errors.generic, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function readCsv(file: File) {
    const [header = [], ...data] = parseCsv(await file.text());
    const keys = header.map((h) => h.trim().toLowerCase());
    const at = (cells: string[], k: string) =>
      keys.includes(k) ? (cells[keys.indexOf(k)] ?? "").trim() : "";
    if (!keys.includes("description") || !keys.includes("quantity") || !keys.includes("rate"))
      return setMessage({ text: labels.csvMissing, error: true });
    const parsed = data.map((cells) => {
      const amount = num(at(cells, "amount"));
      return {
        include: true,
        section: at(cells, "section"),
        item_code: at(cells, "item_code"),
        description: at(cells, "description"),
        uom: at(cells, "uom") || "LS",
        quantity: at(cells, "quantity").replace(/,/g, ""),
        rate: at(cells, "rate").replace(/,/g, ""),
        doc_amount: Number.isFinite(amount) ? amount : null,
        cost_category_id: byCode.get(at(cells, "category_code").toUpperCase()) ?? "",
      };
    });
    setRows(parsed.slice(0, 500));
    setDocTotal(null);
    setNotes(null);
    setMessage({ text: labels.read.replace("{n}", String(parsed.length)) });
  }

  const included = rows.filter((r) => r.include);
  const lineAmount = (r: Row) => {
    const q = num(r.quantity);
    const p = num(r.rate);
    return Number.isFinite(q) && Number.isFinite(p) ? Math.round(q * p * 100) / 100 : NaN;
  };
  const invalid = (r: Row) =>
    !r.description.trim() || !r.cost_category_id || !(num(r.quantity) >= 0) || !(num(r.rate) >= 0);
  const mismatch = (r: Row) =>
    r.doc_amount != null &&
    Number.isFinite(lineAmount(r)) &&
    Math.abs(lineAmount(r) - r.doc_amount) > 1;
  const total = included.reduce((s, r) => s + (lineAmount(r) || 0), 0);
  const missing = included.filter((r) => !r.cost_category_id).length;
  const blocked = !included.length || included.some(invalid);
  const items = included.map((r) => ({
    item_code: r.item_code,
    description: r.description,
    uom: r.uom,
    quantity: num(r.quantity),
    rate: num(r.rate),
    cost_category_id: r.cost_category_id,
  }));

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted">{labels.hint}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {aiEnabled ? (
          <label
            className={cn(
              "cursor-pointer rounded-md border border-violet-200 bg-violet-50/50 p-3",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <span className="flex items-center gap-2 text-[13px] font-medium text-violet-800">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {labels.aiButton}
            </span>
            <span className="mt-1 block text-2xs text-muted">{labels.aiHint}</span>
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
        ) : null}
        <label
          className={cn(
            "cursor-pointer rounded-md border border-line bg-surface p-3",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-brand">
            <FileSpreadsheet className="size-4" />
            {labels.csvButton}
          </span>
          <span className="mt-1 block text-2xs text-muted">{labels.csvHint}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readCsv(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {message ? (
        <p className={cn("text-2xs", message.error ? "text-amber-800" : "text-emerald-700")}>
          {message.text}
        </p>
      ) : null}
      {notes ? (
        <p className="rounded bg-subtle px-2 py-1 text-2xs text-muted">
          {labels.notes}: {notes}
        </p>
      ) : null}

      {rows.length ? (
        <form action={action} className="space-y-3">
          <Hidden values={{ ...hidden, items: JSON.stringify(items) }} />
          <div className="max-h-[55vh] overflow-auto rounded-md border border-line">
            <table className="w-full text-2xs">
              <thead className="sticky top-0 z-10 bg-subtle text-muted">
                <tr>
                  <th className="px-1.5 py-1.5" title={labels.include}>
                    <input
                      type="checkbox"
                      checked={rows.every((r) => r.include)}
                      onChange={(e) =>
                        setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))
                      }
                    />
                  </th>
                  <th className="px-1.5 py-1.5 text-left font-medium">{labels.description}</th>
                  <th className="px-1.5 py-1.5 text-left font-medium">{labels.category}</th>
                  <th className="px-1.5 py-1.5 text-left font-medium">{labels.uom}</th>
                  <th className="px-1.5 py-1.5 text-right font-medium">{labels.quantity}</th>
                  <th className="px-1.5 py-1.5 text-right font-medium">
                    {labels.rate} / {labels.amount}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const bad = r.include && invalid(r);
                  return (
                    <tr key={i} className={cn(!r.include && "opacity-40", bad && "bg-red-50/60")}>
                      <td className="px-1.5 py-1 align-top">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => update(i, { include: e.target.checked })}
                        />
                      </td>
                      <td className="min-w-40 px-1.5 py-1 align-top">
                        {r.section ? <p className="text-[10px] text-faint">{r.section}</p> : null}
                        <div className="flex gap-1">
                          <input
                            value={r.item_code}
                            onChange={(e) => update(i, { item_code: e.target.value })}
                            placeholder={labels.itemCode}
                            className="w-9 rounded border border-line px-1 py-0.5 font-mono"
                          />
                          <input
                            value={r.description}
                            onChange={(e) => update(i, { description: e.target.value })}
                            className="min-w-0 flex-1 rounded border border-line px-1 py-0.5"
                          />
                        </div>
                      </td>
                      <td className="px-1.5 py-1 align-top">
                        <select
                          value={r.cost_category_id}
                          onChange={(e) => update(i, { cost_category_id: e.target.value })}
                          className={cn(
                            "w-28 rounded border px-1 py-0.5",
                            r.cost_category_id ? "border-line" : "border-red-300 text-red-700",
                          )}
                        >
                          <option value="">{labels.pickCategory}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} · {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1.5 py-1 align-top">
                        <input
                          value={r.uom}
                          onChange={(e) => update(i, { uom: e.target.value })}
                          className="w-11 rounded border border-line px-1 py-0.5"
                        />
                      </td>
                      <td className="px-1.5 py-1 align-top">
                        <input
                          value={r.quantity}
                          inputMode="decimal"
                          onChange={(e) => update(i, { quantity: e.target.value })}
                          className="w-14 rounded border border-line px-1 py-0.5 text-right num"
                        />
                      </td>
                      <td className="px-1.5 py-1 align-top">
                        <input
                          value={r.rate}
                          inputMode="decimal"
                          onChange={(e) => update(i, { rate: e.target.value })}
                          className="w-[4.5rem] rounded border border-line px-1 py-0.5 text-right num"
                        />
                        {/* Line total sits under the rate so the table fits the sheet. */}
                        <p className="mt-0.5 text-right whitespace-nowrap text-ink num">
                          = {Number.isFinite(lineAmount(r)) ? fmt(lineAmount(r)) : "—"}
                        </p>
                        {mismatch(r) ? (
                          <p
                            className="flex items-center justify-end gap-0.5 text-[10px] text-amber-700"
                            title={labels.mismatch}
                          >
                            <AlertTriangle className="size-3" />
                            {labels.docAmount} {fmt(r.doc_amount!)}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-2xs">
            <div className="space-y-0.5">
              <p>
                {labels.ourTotal}: <span className="font-semibold num">{fmt(total)}</span>
                {docTotal != null ? (
                  <>
                    {" · "}
                    {labels.docTotal}: <span className="num">{fmt(docTotal)}</span>
                  </>
                ) : null}
              </p>
              {docTotal != null && Math.abs(docTotal - total) > 1 ? (
                <p className="text-amber-700">{labels.totalMismatch}</p>
              ) : null}
              {missing ? (
                <p className="text-red-700">
                  {labels.missingCategory.replace("{n}", String(missing))}
                </p>
              ) : null}
            </div>
          </div>
          <SheetFooter>
            <SubmitButton disabled={blocked}>
              {labels.submit.replace("{n}", String(included.length))}
            </SubmitButton>
          </SheetFooter>
        </form>
      ) : null}
    </div>
  );
}
