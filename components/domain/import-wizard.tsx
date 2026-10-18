"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseCsv, toCsv } from "@/lib/csv";
import {
  MAX_IMPORT_ROWS,
  importColumns,
  importKinds,
  rowsFromCsv,
  type ImportKind,
  type ImportResult,
} from "@/lib/import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

type Labels = {
  kinds: Record<ImportKind, { title: string; body: string }>;
  order: string;
  columns: string;
  column: string;
  required: string;
  format: string;
  columnLabels: Record<string, string>;
  columnFormats: Record<string, string>;
  template: string;
  choose: string;
  checking: string;
  rows: string;
  row: string;
  result: string;
  allOk: string;
  hasErrors: string;
  commit: string;
  committing: string;
  done: string;
  another: string;
  missingColumns: string;
  unknownColumns: string;
  tooMany: string;
  empty: string;
  ok: string;
  errors: Record<string, string>;
};

type State =
  | { step: "idle" }
  | { step: "checking" | "committing"; file: File; rows: Record<string, string>[] }
  | { step: "checked"; file: File; rows: Record<string, string>[]; result: ImportResult }
  | { step: "done"; result: ImportResult; fileName: string }
  | { step: "error"; message: string };

/** CSV import: pick a dataset, check every row in the database, then commit all-or-nothing. */
export function ImportWizard({
  projectId,
  organizationId,
  locale,
  labels,
}: {
  projectId: string;
  organizationId: string;
  locale: string;
  labels: Labels;
}) {
  const [kind, setKind] = useState<ImportKind>("UNITS");
  const [state, setState] = useState<State>({ step: "idle" });
  const columns = importColumns[kind];
  const runUrl = `/${locale}/app/projects/${projectId}/setup/import/run`;

  const errorText = (code: string | undefined) => {
    if (!code) return "";
    if (code.startsWith("db:")) return `${labels.errors.db}: ${code.slice(3)}`;
    const [name, col] = code.split(":");
    const base = labels.errors[name] ?? code;
    return col ? `${base} · ${labels.columnLabels[col] ?? col}` : base;
  };

  async function run(body: Record<string, unknown>) {
    const res = await fetch(runUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(labels.errors[json.error] ?? labels.errors.failed);
    return json as ImportResult;
  }

  async function check(file: File) {
    const table = parseCsv(await file.text());
    const { rows, missing, unknown } = rowsFromCsv(kind, table);
    if (missing.length)
      return setState({
        step: "error",
        message: `${labels.missingColumns}: ${missing.join(", ")}`,
      });
    if (unknown.length)
      return setState({
        step: "error",
        message: `${labels.unknownColumns}: ${unknown.join(", ")}`,
      });
    if (!rows.length) return setState({ step: "error", message: labels.empty });
    if (rows.length > MAX_IMPORT_ROWS) return setState({ step: "error", message: labels.tooMany });
    setState({ step: "checking", file, rows });
    try {
      const result = await run({ kind, rows, fileName: file.name, dryRun: true });
      setState({ step: "checked", file, rows, result });
    } catch (e) {
      setState({ step: "error", message: (e as Error).message });
    }
  }

  async function commit(file: File, rows: Record<string, string>[]) {
    setState({ step: "committing", file, rows });
    try {
      // The original file is kept for the audit trail; the batch stores only its path.
      const filePath = `${organizationId}/${projectId}/${crypto.randomUUID()}.csv`;
      const { error } = await createClient()
        .storage.from("imports")
        .upload(filePath, file, { contentType: "text/csv" });
      if (error) throw new Error(labels.errors.upload);
      const result = await run({ kind, rows, fileName: file.name, filePath, dryRun: false });
      if (!result.ok) return setState({ step: "checked", file, rows, result });
      setState({ step: "done", result, fileName: file.name });
    } catch (e) {
      setState({ step: "error", message: (e as Error).message });
    }
  }

  function downloadTemplate() {
    const blob = new Blob([toCsv([columns.map((c) => c.key)])], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind.toLowerCase()}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const busy = state.step === "checking" || state.step === "committing";
  const preview = state.step === "checked" ? state : null;
  const shown = columns.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {importKinds.map((k, i) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            onClick={() => {
              setKind(k);
              setState({ step: "idle" });
            }}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              k === kind
                ? "border-brand bg-brand-soft/60 ring-1 ring-brand/30"
                : "border-line bg-surface hover:bg-subtle",
            )}
          >
            <p className="text-[13px] font-semibold">
              <span className="mr-1.5 text-muted num">{i + 1}.</span>
              {labels.kinds[k].title}
            </p>
            <p className="mt-0.5 text-2xs text-muted">{labels.kinds[k].body}</p>
          </button>
        ))}
      </div>
      <p className="text-2xs text-muted">{labels.order}</p>

      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-semibold">{labels.columns}</p>
          <Button size="xs" onClick={downloadTemplate}>
            <Download />
            {labels.template}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-subtle text-2xs text-muted">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">{labels.column}</th>
                <th className="px-4 py-1.5 text-left font-medium">{labels.format}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {columns.map((c) => (
                <tr key={c.key}>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className="font-mono text-2xs">{c.key}</span>
                    {c.required ? <span className="ml-1 text-red-600">*</span> : null}
                    <span className="ml-2 text-muted">{labels.columnLabels[c.key]}</span>
                  </td>
                  <td className="px-4 py-1.5 text-2xs text-muted">
                    {labels.columnFormats[`${kind}.${c.key}`] ?? labels.columnFormats[c.key] ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-2xs text-muted">
          <span className="text-red-600">*</span> {labels.required}
        </p>
      </div>

      {state.step === "done" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            {labels.done
              .replace("{n}", String(state.result.total))
              .replace("{file}", state.fileName)}
          </p>
          <Button size="xs" onClick={() => setState({ step: "idle" })}>
            {labels.another}
          </Button>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-6 text-[13px] font-medium text-brand hover:bg-subtle",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {state.step === "checking"
            ? labels.checking
            : state.step === "committing"
              ? labels.committing
              : labels.choose.replace("{kind}", labels.kinds[kind].title)}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) check(f);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {state.step === "error" ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {state.message}
        </p>
      ) : null}

      {preview ? (
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-[13px]">
              <span className="font-semibold">{preview.file.name}</span>
              <span className="ml-2 text-muted">
                {preview.result.total} {labels.rows}
              </span>
            </p>
            {preview.result.failed === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-2xs text-emerald-700">{labels.allOk}</span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => commit(preview.file, preview.rows)}
                >
                  {labels.commit.replace("{n}", String(preview.result.total))}
                </Button>
              </div>
            ) : (
              <span className="text-2xs text-red-700">
                {labels.hasErrors.replace("{n}", String(preview.result.failed))}
              </span>
            )}
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-subtle text-2xs text-muted">
                <tr>
                  <th className="px-3 py-1.5 text-right font-medium">{labels.row}</th>
                  {shown.map((c) => (
                    <th key={c.key} className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                      {labels.columnLabels[c.key]}
                    </th>
                  ))}
                  <th className="px-3 py-1.5 text-left font-medium">{labels.result}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.result.results.map((r) => {
                  const row = preview.rows[r.row - 1] ?? {};
                  return (
                    <tr key={r.row} className={r.ok ? undefined : "bg-red-50/50"}>
                      <td className="px-3 py-1.5 text-right text-muted num">{r.row}</td>
                      {shown.map((c) => (
                        <td key={c.key} className="max-w-48 truncate px-3 py-1.5">
                          {row[c.key] || <span className="text-faint">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-1.5">
                        {r.ok ? (
                          <Badge tone="success">{labels.ok}</Badge>
                        ) : (
                          <span className="flex items-center gap-1 text-2xs text-red-700">
                            <XCircle className="size-3.5 shrink-0" />
                            {errorText(r.error)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
