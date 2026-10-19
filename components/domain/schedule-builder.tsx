"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { paymentKinds, type ScheduleItem } from "@/lib/payments";
import { Hidden } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";

const cell =
  "h-8 w-full rounded border border-line-strong bg-surface px-2 text-[13px] focus:border-brand focus:outline-none";

/** Editable installment rows; the total is compared live with the agreed price. */
export function ScheduleBuilder({
  action,
  hidden,
  initial,
  price,
  locale,
  parts = [],
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  initial: ScheduleItem[];
  price: number;
  locale: string;
  /** Parts of a leasehold/split contract; when given, each row can be assigned to one. */
  parts?: { id: string; label: string; amount: number }[];
  labels: {
    part?: string;
    noPart?: string;
    partTotals?: string;
    hint: string;
    kind: string;
    labelTh: string;
    labelEn: string;
    due: string;
    amount: string;
    addRow: string;
    total: string;
    difference: string;
    save: string;
    kinds: Record<string, string>;
  };
}) {
  const [rows, setRows] = useState<ScheduleItem[]>(initial);
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const diff = Math.round((total - price) * 100) / 100;
  const money = (n: number) =>
    new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 2 }).format(
      n,
    );
  const set = (i: number, patch: Partial<ScheduleItem>) =>
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const valid = rows.length > 0 && rows.every((r) => Number(r.amount) > 0 && r.due_date);

  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, items: JSON.stringify(rows) }} />
      <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{labels.hint}</p>
      <div className="overflow-x-auto">
        <table
          className={cn("w-full text-[13px]", parts.length ? "min-w-[820px]" : "min-w-[640px]")}
        >
          <thead className="text-2xs text-muted">
            <tr>
              <th className="w-8 text-left font-medium">#</th>
              <th className="w-28 text-left font-medium">{labels.kind}</th>
              <th className="text-left font-medium">{labels.labelTh}</th>
              <th className="text-left font-medium">{labels.labelEn}</th>
              <th className="w-36 text-left font-medium">{labels.due}</th>
              <th className="w-32 text-right font-medium">{labels.amount}</th>
              {parts.length ? <th className="w-40 text-left font-medium">{labels.part}</th> : null}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 text-muted num">{i + 1}</td>
                <td className="py-1 pr-1">
                  <select
                    className={cell}
                    value={r.kind}
                    onChange={(e) => set(i, { kind: e.target.value as ScheduleItem["kind"] })}
                  >
                    {paymentKinds.map((k) => (
                      <option key={k} value={k}>
                        {labels.kinds[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-1">
                  <input
                    className={cell}
                    value={r.label_th}
                    onChange={(e) => set(i, { label_th: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    className={cell}
                    value={r.label_en}
                    onChange={(e) => set(i, { label_en: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    type="date"
                    className={cell}
                    value={r.due_date}
                    onChange={(e) => set(i, { due_date: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={cn(cell, "text-right num")}
                    value={r.amount}
                    onChange={(e) => set(i, { amount: Number(e.target.value) })}
                  />
                </td>
                {parts.length ? (
                  <td className="py-1 pr-1">
                    <select
                      className={cell}
                      value={r.contract_part_id ?? ""}
                      onChange={(e) => set(i, { contract_part_id: e.target.value || null })}
                    >
                      <option value="">{labels.noPart}</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : null}
                <td className="py-1">
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                    className="grid size-8 place-items-center text-faint hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            setRows((list) => [
              ...list,
              {
                kind: "INSTALLMENT",
                label_th: `งวดที่ ${list.length + 1}`,
                label_en: `Installment ${list.length + 1}`,
                amount: 0,
                due_date: list.at(-1)?.due_date ?? "",
              },
            ])
          }
          className="inline-flex items-center gap-1 text-2xs font-medium text-brand hover:underline"
        >
          <Plus className="size-3.5" />
          {labels.addRow}
        </button>
        <p className="text-[13px]">
          {labels.total}: <span className="font-semibold num">{money(total)}</span>
          {price ? (
            <span
              className={cn(
                "ml-3 text-2xs num",
                diff === 0 ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {labels.difference}: {diff > 0 ? "+" : ""}
              {money(diff)}
            </span>
          ) : null}
        </p>
      </div>
      {parts.length ? (
        <ul className="space-y-0.5 rounded-md bg-subtle px-3 py-2 text-2xs">
          <li className="font-medium text-muted">{labels.partTotals}</li>
          {parts.map((p) => {
            const sum = rows
              .filter((r) => r.contract_part_id === p.id)
              .reduce((a, r) => a + (Number(r.amount) || 0), 0);
            return (
              <li key={p.id} className="flex justify-between gap-3">
                <span>{p.label}</span>
                <span
                  className={cn("num", sum === p.amount ? "text-emerald-700" : "text-amber-700")}
                >
                  {money(sum)} / {money(p.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <SheetFooter>
        <SubmitButton disabled={!valid}>{labels.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
