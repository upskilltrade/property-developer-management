"use client";

import { useState } from "react";
import { Field, FormGrid, Hidden, Input, Select } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ForecastLine } from "@/lib/forecast";

type Labels = {
  label: string;
  category: string;
  method: string;
  amount: string;
  rate: string;
  ratePerSqm: string;
  quantity: string;
  quantitySqm: string;
  pct: string;
  timing: string;
  costCategory: string;
  costCategoryHint: string;
  none: string;
  selfOnly: string;
  areaHint: string;
  unitsRate: string;
  unitsRateHint: string;
  save: string;
  methods: Record<string, string>;
  timings: Record<string, string>;
  categories: Record<string, string>;
};

/** Add or edit one forecast line; only the inputs the chosen method uses are shown. */
export function ForecastLineForm({
  action,
  hidden,
  line,
  kind,
  categoryOptions,
  costCategories,
  totalFloorArea,
  unpricedUnits,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  line?: ForecastLine;
  kind: "REVENUE" | "COST";
  categoryOptions: readonly string[];
  costCategories: { id: string; code: string; name: string }[];
  totalFloorArea: number;
  unpricedUnits: number;
  labels: Labels;
}) {
  const methods =
    kind === "REVENUE"
      ? (["UNITS_FROM_SYSTEM", "PER_UNIT", "LUMP"] as const)
      : (["LUMP", "PER_SQM", "PER_UNIT", "PCT_REVENUE"] as const);
  const [category, setCategory] = useState(line?.category ?? categoryOptions[0]);
  const [method, setMethod] = useState<string>(line?.method ?? methods[0]);
  const perSqm = method === "PER_SQM";

  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, line_id: line?.id ?? "", kind }} />
      <FormGrid>
        <Field label={labels.category} required>
          <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {labels.categories[c] ?? c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.method} required>
          <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods
              .filter((m) => m !== "UNITS_FROM_SYSTEM" || category === "SALES_HOUSES")
              .map((m) => (
                <option key={m} value={m}>
                  {labels.methods[m]}
                </option>
              ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={labels.label} required>
        <Input
          name="label"
          required
          defaultValue={line?.label ?? labels.categories[category] ?? ""}
        />
      </Field>
      {method === "UNITS_FROM_SYSTEM" ? (
        <Field
          label={labels.unitsRate}
          hint={labels.unitsRateHint.replace("{n}", unpricedUnits.toLocaleString())}
        >
          <Input name="rate" inputMode="decimal" defaultValue={line?.rate || ""} />
        </Field>
      ) : null}
      {method === "LUMP" ? (
        <Field label={labels.amount}>
          <Input name="amount" inputMode="decimal" defaultValue={line?.amount || ""} />
        </Field>
      ) : null}
      {method === "PER_SQM" || method === "PER_UNIT" ? (
        <FormGrid>
          <Field label={perSqm ? labels.ratePerSqm : labels.rate}>
            <Input name="rate" inputMode="decimal" defaultValue={line?.rate || ""} />
          </Field>
          <Field
            label={perSqm ? labels.quantitySqm : labels.quantity}
            hint={
              perSqm && totalFloorArea
                ? labels.areaHint.replace("{n}", totalFloorArea.toLocaleString())
                : undefined
            }
          >
            <Input
              name="quantity"
              inputMode="decimal"
              defaultValue={line?.quantity || (perSqm && totalFloorArea ? totalFloorArea : "")}
            />
          </Field>
        </FormGrid>
      ) : null}
      {method === "PCT_REVENUE" ? (
        <Field label={labels.pct}>
          <Input name="pct" inputMode="decimal" defaultValue={line?.pct || ""} />
        </Field>
      ) : null}
      <FormGrid>
        <Field label={labels.timing}>
          <Select
            name="timing"
            defaultValue={line?.timing ?? (kind === "REVENUE" ? "WITH_SALES" : "SPREAD")}
          >
            {Object.entries(labels.timings).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "COST" ? (
          <Field label={labels.costCategory} hint={labels.costCategoryHint}>
            <Select name="cost_category_id" defaultValue={line?.cost_category_id ?? ""}>
              <option value="">{labels.none}</option>
              {costCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </FormGrid>
      {kind === "COST" ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            name="self_sales_only"
            defaultChecked={line?.self_sales_only ?? false}
          />
          {labels.selfOnly}
        </label>
      ) : null}
      <SheetFooter>
        <SubmitButton>{labels.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
