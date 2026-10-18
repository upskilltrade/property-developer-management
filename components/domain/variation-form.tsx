import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { VoItemsEditor, type VoItem } from "@/components/domain/vo-items-editor";

type Option = { id: string; label: string };
export type VariationValues = {
  title?: string | null;
  unit_id?: string | null;
  original_scope?: string | null;
  revised_scope?: string | null;
  cost_delta?: number | string | null;
  price_delta?: number | string | null;
  time_delta_days?: number | null;
  partner_id?: string | null;
  customer_facing?: boolean;
  requires_payment_before_release?: boolean;
  payment_due_days?: number | null;
  items?: VoItem[];
};

/** Variation order scope and impacts. Used to create a VO, and (revise) to append a new version. */
export function VariationForm({
  t,
  action,
  hidden,
  units,
  partners,
  values = {},
  revise = false,
  submitLabel,
}: {
  t: Pick<Dictionary, "changes">;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  units: Option[];
  partners: Option[];
  values?: VariationValues;
  revise?: boolean;
  submitLabel: string;
}) {
  const c = t.changes;
  return (
    <form action={action} className="space-y-3">
      <Hidden values={hidden} />
      {!revise ? (
        <FormGrid>
          <Field label={c.title} required>
            <Input name="title" required defaultValue={values.title ?? ""} />
          </Field>
          <Field label={c.unit}>
            <Select name="unit_id" defaultValue={values.unit_id ?? ""}>
              <option value="">{c.noUnit}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
      ) : null}
      <FormGrid>
        <Field label={c.originalScope}>
          <Textarea name="original_scope" defaultValue={values.original_scope ?? ""} />
        </Field>
        <Field label={c.revisedScope} required>
          <Textarea name="revised_scope" required defaultValue={values.revised_scope ?? ""} />
        </Field>
      </FormGrid>
      <VoItemsEditor labels={c} initial={values.items} />
      <FormGrid cols={3}>
        <Field label={c.priceDelta} hint={c.priceFromItems}>
          <Input
            name="price_delta"
            type="number"
            step="any"
            defaultValue={values.price_delta ?? 0}
          />
        </Field>
        <Field label={c.costDelta}>
          <Input name="cost_delta" type="number" step="any" defaultValue={values.cost_delta ?? 0} />
        </Field>
        <Field label={c.timeDelta}>
          <Input
            name="time_delta_days"
            type="number"
            min="-365"
            max="365"
            defaultValue={values.time_delta_days ?? 0}
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={c.partner}>
          <Select name="partner_id" defaultValue={values.partner_id ?? ""}>
            <option value="">—</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        {!revise ? (
          <Field label={c.paymentDueDays}>
            <Input
              name="payment_due_days"
              type="number"
              min="0"
              max="365"
              defaultValue={values.payment_due_days ?? 7}
            />
          </Field>
        ) : null}
      </FormGrid>
      <div className="flex flex-wrap gap-4 text-[13px]">
        {!revise ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="customer_facing"
              defaultChecked={values.customer_facing ?? true}
            />
            {c.customerFacing}
          </label>
        ) : null}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="requires_payment_before_release"
            defaultChecked={values.requires_payment_before_release ?? false}
          />
          {c.requirePayment}
        </label>
      </div>
      <Field label={c.note} hint={revise ? c.reviseHint : undefined}>
        <Input name="note" />
      </Field>
      <SheetFooter>
        <SubmitButton>{submitLabel}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
