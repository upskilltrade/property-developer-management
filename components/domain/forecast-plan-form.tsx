"use client";

import { useState } from "react";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ForecastPlan } from "@/lib/forecast";

/**
 * Reference rates the owner can pull in with one click and then confirm with their accountant.
 * Sources are listed in the form (forecast.plan.refs); commission and target margin have no
 * legal standard, so they are never filled in.
 */
export const referenceRates = {
  transfer_fee_pct: "2",
  developer_transfer_share_pct: "50",
  business_tax_pct: "3.3",
  income_tax_pct: "20",
} as const;
type RateKey = keyof typeof referenceRates;

type Labels = {
  start: string;
  sellOut: string;
  sellOutHint: string;
  mode: string;
  self: string;
  agent: string;
  commission: string;
  commissionHint: string;
  targetMargin: string;
  targetMarginHint: string;
  taxWarning: string;
  useRefs: string;
  refsTitle: string;
  refs: string[];
  transferFee: string;
  transferShare: string;
  businessTax: string;
  incomeTax: string;
  notes: string;
  save: string;
};

export function ForecastPlanForm({
  action,
  hidden,
  plan,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  plan: ForecastPlan;
  labels: Labels;
}) {
  const v = (x: number | null) => (x == null ? "" : String(x));
  const [rates, setRates] = useState<Record<RateKey, string>>({
    transfer_fee_pct: v(plan.transfer_fee_pct),
    developer_transfer_share_pct: v(plan.developer_transfer_share_pct),
    business_tax_pct: v(plan.business_tax_pct),
    income_tax_pct: v(plan.income_tax_pct),
  });
  const rate = (k: RateKey) => ({
    name: k,
    inputMode: "decimal" as const,
    value: rates[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setRates((r) => ({ ...r, [k]: e.target.value })),
  });

  return (
    <form action={action} className="space-y-3">
      <Hidden values={hidden} />
      <FormGrid>
        <Field label={labels.start}>
          <Input name="start_month" type="month" defaultValue={plan.start_month.slice(0, 7)} />
        </Field>
        <Field label={labels.sellOut} hint={labels.sellOutHint}>
          <Input
            name="sell_out_months"
            type="number"
            min="1"
            max="240"
            defaultValue={plan.sell_out_months}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={labels.mode}>
          <Select name="sales_mode" defaultValue={plan.sales_mode}>
            <option value="SELF">{labels.self}</option>
            <option value="AGENT">{labels.agent}</option>
          </Select>
        </Field>
        <Field label={labels.commission} hint={labels.commissionHint}>
          <Input
            name="agent_commission_pct"
            inputMode="decimal"
            defaultValue={v(plan.agent_commission_pct)}
          />
        </Field>
      </FormGrid>
      <Field label={labels.targetMargin} hint={labels.targetMarginHint}>
        <Input
          name="target_margin_pct"
          inputMode="decimal"
          defaultValue={v(plan.target_margin_pct)}
        />
      </Field>
      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{labels.refsTitle}</p>
          <Button size="sm" onClick={() => setRates({ ...referenceRates })}>
            {labels.useRefs}
          </Button>
        </div>
        <ul className="list-disc space-y-1 pl-4">
          {labels.refs.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p>{labels.taxWarning}</p>
      </div>
      <FormGrid>
        <Field label={labels.transferFee}>
          <Input {...rate("transfer_fee_pct")} />
        </Field>
        <Field label={labels.transferShare}>
          <Input {...rate("developer_transfer_share_pct")} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={labels.businessTax}>
          <Input {...rate("business_tax_pct")} />
        </Field>
        <Field label={labels.incomeTax}>
          <Input {...rate("income_tax_pct")} />
        </Field>
      </FormGrid>
      <Field label={labels.notes}>
        <Textarea name="notes" defaultValue={plan.notes ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{labels.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
