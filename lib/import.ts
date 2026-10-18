export const importKinds = ["UNITS", "SALES", "SCHEDULES", "PAYMENTS"] as const;
export type ImportKind = (typeof importKinds)[number];

/** Template columns per import, in file order; the database validates every value. */
export const importColumns: Record<ImportKind, { key: string; required?: boolean }[]> = {
  UNITS: [
    { key: "unit_code", required: true },
    { key: "name" },
    { key: "phase_code" },
    { key: "plot_code" },
    { key: "house_type_code" },
    { key: "list_price" },
    { key: "target_completion_date" },
  ],
  SALES: [
    { key: "unit_code", required: true },
    { key: "customer_name", required: true },
    { key: "phone" },
    { key: "email" },
    { key: "nationality" },
    { key: "status", required: true },
    { key: "agreed_price", required: true },
    { key: "reservation_date" },
    { key: "contract_date" },
    { key: "transfer_date" },
    { key: "legacy_contract_no" },
    { key: "notes" },
  ],
  SCHEDULES: [
    { key: "unit_code", required: true },
    { key: "sequence", required: true },
    { key: "kind" },
    { key: "label_th" },
    { key: "label_en" },
    { key: "amount", required: true },
    { key: "due_date", required: true },
  ],
  PAYMENTS: [
    { key: "unit_code", required: true },
    { key: "sequence", required: true },
    { key: "amount", required: true },
    { key: "paid_on", required: true },
    { key: "method" },
    { key: "reference" },
    { key: "legacy_receipt_no" },
  ],
};

export const MAX_IMPORT_ROWS = 2000;

export type ImportRowResult = { row: number; ok: boolean; error?: string; ref?: string | null };
export type ImportResult = {
  ok: boolean;
  dry_run: boolean;
  batch_id: string | null;
  failed: number;
  total: number;
  results: ImportRowResult[];
};

/**
 * Turns parsed CSV rows into objects keyed by the template's column names. Header names are
 * matched case-insensitively; unknown columns are reported so a wrong template is caught early.
 */
export function rowsFromCsv(kind: ImportKind, table: string[][]) {
  const [header = [], ...data] = table;
  const keys = header.map((h) => h.trim().toLowerCase());
  const known = new Set(importColumns[kind].map((c) => c.key));
  const unknown = keys.filter((k) => k && !known.has(k));
  const missing = importColumns[kind]
    .filter((c) => c.required && !keys.includes(c.key))
    .map((c) => c.key);
  const rows = data.map((cells) =>
    Object.fromEntries(
      keys.map((k, i) => [k, (cells[i] ?? "").trim()]).filter(([k]) => known.has(k)),
    ),
  );
  return { rows, unknown, missing };
}
