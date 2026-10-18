"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type VoItem = {
  kind: "ADD" | "OMIT";
  description: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
};
type Labels = {
  items: string;
  itemsHint: string;
  kind: { ADD: string; OMIT: string };
  itemDesc: string;
  qty: string;
  itemUnit: string;
  unitPrice: string;
  amount: string;
  addRow: string;
  omitRow: string;
  totalAdd: string;
  totalOmit: string;
  net: string;
};

const money = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amountOf = (it: VoItem) =>
  Math.round(Number(it.quantity || 0) * Number(it.unit_price || 0) * 100) / 100;
const input =
  "h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] focus:border-brand focus:outline-none";

/** Line items for a VO version; serialised into the hidden "items" field for the server action. */
export function VoItemsEditor({ labels, initial = [] }: { labels: Labels; initial?: VoItem[] }) {
  const [rows, setRows] = useState<VoItem[]>(initial);
  const set = (i: number, patch: Partial<VoItem>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const add = (kind: VoItem["kind"]) =>
    setRows((r) => [...r, { kind, description: "", quantity: 1, unit: "", unit_price: 0 }]);
  const complete = rows.filter((r) => r.description.trim() && Number(r.quantity) > 0);
  const totalAdd = complete.filter((r) => r.kind === "ADD").reduce((a, r) => a + amountOf(r), 0);
  const totalOmit = complete.filter((r) => r.kind === "OMIT").reduce((a, r) => a + amountOf(r), 0);

  return (
    <div className="rounded-md border border-line">
      <input type="hidden" name="items" value={JSON.stringify(complete)} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-subtle px-3 py-2">
        <p className="min-w-0 flex-1 text-2xs">
          <span className="font-medium text-ink-2">{labels.items}</span>
          <span className="block text-muted">{labels.itemsHint}</span>
        </p>
        <button
          type="button"
          onClick={() => add("ADD")}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-2xs font-medium text-emerald-800"
        >
          <Plus className="size-3.5" />
          {labels.addRow}
        </button>
        <button
          type="button"
          onClick={() => add("OMIT")}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 text-2xs font-medium text-red-800"
        >
          <Minus className="size-3.5" />
          {labels.omitRow}
        </button>
      </div>
      {rows.length ? (
        <div className="divide-y divide-line">
          {rows.map((r, i) => (
            <div
              key={i}
              className={cn(
                "grid grid-cols-12 items-center gap-2 px-3 py-2",
                r.kind === "OMIT" && "bg-red-50/40",
              )}
            >
              <select
                aria-label={labels.kind.ADD}
                value={r.kind}
                onChange={(e) => set(i, { kind: e.target.value as VoItem["kind"] })}
                className={cn(
                  input,
                  "col-span-4 sm:col-span-3",
                  r.kind === "ADD" ? "text-emerald-700" : "text-red-700",
                )}
              >
                <option value="ADD">{labels.kind.ADD}</option>
                <option value="OMIT">{labels.kind.OMIT}</option>
              </select>
              <input
                aria-label={labels.itemDesc}
                placeholder={labels.itemDesc}
                value={r.description}
                maxLength={300}
                onChange={(e) => set(i, { description: e.target.value })}
                className={cn(input, "col-span-8 sm:col-span-9")}
              />
              <input
                aria-label={labels.qty}
                placeholder={labels.qty}
                type="number"
                min="0"
                step="any"
                value={r.quantity}
                onChange={(e) => set(i, { quantity: e.target.value })}
                className={cn(input, "col-span-3 text-right")}
              />
              <input
                aria-label={labels.itemUnit}
                placeholder={labels.itemUnit}
                value={r.unit ?? ""}
                maxLength={20}
                onChange={(e) => set(i, { unit: e.target.value })}
                className={cn(input, "col-span-2")}
              />
              <input
                aria-label={labels.unitPrice}
                placeholder={labels.unitPrice}
                type="number"
                min="0"
                step="any"
                value={r.unit_price}
                onChange={(e) => set(i, { unit_price: e.target.value })}
                className={cn(input, "col-span-3 text-right")}
              />
              <span
                className={cn(
                  "col-span-3 text-right text-[13px] font-medium num",
                  r.kind === "ADD" ? "text-emerald-700" : "text-red-700",
                )}
              >
                {r.kind === "OMIT" ? "−" : "+"}
                {money(amountOf(r))}
              </span>
              <button
                type="button"
                aria-label="remove"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="col-span-1 grid size-7 place-items-center justify-self-end rounded-md text-muted hover:bg-subtle hover:text-red-700"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {complete.length ? (
        <dl className="grid grid-cols-3 gap-2 border-t border-line px-3 py-2 text-2xs">
          <div>
            <dt className="text-muted">{labels.totalAdd}</dt>
            <dd className="font-semibold text-emerald-700 num">+{money(totalAdd)}</dd>
          </div>
          <div>
            <dt className="text-muted">{labels.totalOmit}</dt>
            <dd className="font-semibold text-red-700 num">−{money(totalOmit)}</dd>
          </div>
          <div>
            <dt className="text-muted">{labels.net}</dt>
            <dd className="font-semibold num">{money(totalAdd - totalOmit)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
