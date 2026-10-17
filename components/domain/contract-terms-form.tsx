import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

export type ContractTerms = {
  contract_price?: number | string | null;
  down_payment?: number | string | null;
  installment_count?: number | null;
  transfer_due?: string | null;
  language?: string | null;
  terms?: string | null;
};

/** Contract terms: creates version 1 from a booking, or a new version of a draft (with a change note). */
export function ContractTermsForm({
  t,
  action,
  hidden,
  values = {},
  revise = false,
  submitLabel,
}: {
  t: Pick<Dictionary, "sales">;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  values?: ContractTerms;
  revise?: boolean;
  submitLabel: string;
}) {
  const c = t.sales.contract;
  return (
    <form action={action} className="space-y-3">
      <Hidden values={hidden} />
      <FormGrid>
        <Field label={c.price} required>
          <Input
            name="contract_price"
            type="number"
            min="1"
            step="any"
            required
            defaultValue={values.contract_price ?? ""}
          />
        </Field>
        <Field label={c.downPayment}>
          <Input
            name="down_payment"
            type="number"
            min="0"
            step="any"
            defaultValue={values.down_payment ?? 0}
          />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label={c.installments}>
          <Input
            name="installment_count"
            type="number"
            min="0"
            max="120"
            defaultValue={values.installment_count ?? 0}
          />
        </Field>
        <Field label={c.transferDue}>
          <Input name="transfer_due" type="date" defaultValue={values.transfer_due ?? ""} />
        </Field>
        <Field label={c.language}>
          <Select name="language" defaultValue={values.language ?? "TH"}>
            {Object.entries(c.languages).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={c.terms}>
        <Textarea name="terms" defaultValue={values.terms ?? ""} />
      </Field>
      {revise ? (
        <Field label={c.changeNote} required hint={c.reviseHint}>
          <Input name="change_note" required />
        </Field>
      ) : null}
      <SheetFooter>
        <SubmitButton>{submitLabel}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
