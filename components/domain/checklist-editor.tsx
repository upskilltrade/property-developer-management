"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ChecklistItem } from "@/lib/standards";

type Option = { id: string; label: string };
type Labels = {
  item: string;
  standard: string;
  clause: string;
  clausePlaceholder: string;
  criterion: string;
  method: string;
  addItem: string;
  noVerified: string;
};

const input =
  "h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] focus:border-brand focus:outline-none";
const blank = (standardId = ""): ChecklistItem => ({
  item: "",
  standard_id: standardId,
  clause: "",
  criterion: "",
  method: "",
});

/**
 * Checklist rows, each tied to a verified standard with the clause and acceptance criterion copied
 * from that document. Serialised into the hidden "items" field; the database rejects rows missing any
 * part of the reference.
 */
export function ChecklistEditor({
  standards,
  labels,
  initial = [],
}: {
  standards: Option[];
  labels: Labels;
  initial?: ChecklistItem[];
}) {
  const [rows, setRows] = useState<ChecklistItem[]>(
    initial.length ? initial : [blank(standards[0]?.id)],
  );
  const set = (i: number, patch: Partial<ChecklistItem>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  if (!standards.length)
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-2xs text-amber-900">
        {labels.noVerified}
      </p>
    );
  return (
    <div className="space-y-2">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-md border border-line p-2">
          <div className="flex items-center gap-2">
            <span className="w-6 text-right text-2xs text-muted">{i + 1}.</span>
            <input
              required
              aria-label={labels.item}
              placeholder={labels.item}
              value={r.item}
              maxLength={300}
              onChange={(e) => set(i, { item: e.target.value })}
              className={input}
            />
            <button
              type="button"
              aria-label="remove"
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-red-700"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="grid gap-2 pl-8 sm:grid-cols-2">
            <select
              required
              aria-label={labels.standard}
              value={r.standard_id ?? ""}
              onChange={(e) => set(i, { standard_id: e.target.value })}
              className={input}
            >
              {standards.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              required
              aria-label={labels.clause}
              placeholder={labels.clausePlaceholder}
              value={r.clause ?? ""}
              maxLength={120}
              onChange={(e) => set(i, { clause: e.target.value })}
              className={input}
            />
            <textarea
              required
              aria-label={labels.criterion}
              placeholder={labels.criterion}
              value={r.criterion ?? ""}
              maxLength={1000}
              rows={2}
              onChange={(e) => set(i, { criterion: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[13px] focus:border-brand focus:outline-none sm:col-span-2"
            />
            <input
              aria-label={labels.method}
              placeholder={labels.method}
              value={r.method ?? ""}
              maxLength={200}
              onChange={(e) => set(i, { method: e.target.value })}
              className={`${input} sm:col-span-2`}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setRows((r) => [...r, blank(r[r.length - 1]?.standard_id ?? standards[0]?.id)])
        }
        className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong px-2 text-2xs font-medium hover:bg-subtle"
      >
        <Plus className="size-3.5" />
        {labels.addItem}
      </button>
    </div>
  );
}
