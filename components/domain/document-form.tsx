"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

type Option = { id: string; label: string };
const types = ["COMMITMENT", "AP", "AR", "PAYMENT", "RECEIPT"] as const;
type DocType = (typeof types)[number];

/** Finance document entry: shows only the fields that apply to the selected document type. */
export function DocumentForm({
  t,
  locale,
  projectId,
  action,
  categories,
  cashAccounts,
  openInvoices,
  defaultDate,
}: {
  t: Pick<Dictionary, "finance" | "status" | "common">;
  locale: string;
  projectId: string;
  action: (fd: FormData) => Promise<void>;
  categories: Option[];
  cashAccounts: Option[];
  openInvoices: (Option & { type: string })[];
  defaultDate: string;
}) {
  const [type, setType] = useState<DocType>("AP");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState("7");
  const [wht, setWht] = useState("0");
  const [source, setSource] = useState("");
  const f = t.finance.fields;
  const isInvoice = type === "AP" || type === "AR";
  const isCash = type === "PAYMENT" || type === "RECEIPT";
  const needsCategory = type === "COMMITMENT" || type === "AP";
  const settles = type === "PAYMENT" ? "AP" : type === "RECEIPT" ? "AR" : null;
  const hint = {
    COMMITMENT: t.finance.hints.commitment,
    AP: t.finance.hints.ap,
    AR: t.finance.hints.ar,
    PAYMENT: t.finance.hints.payment,
    RECEIPT: t.finance.hints.receipt,
  }[type];

  const base = Number(amount) || 0;
  const vatAmount = isInvoice ? Math.round(base * Number(vat || 0)) / 100 : 0;
  const whtRate = Number(wht || 0);
  const whtAmount =
    isCash && whtRate < 100
      ? Math.round(((base * whtRate) / (100 - whtRate || 100)) * 100) / 100
      : 0;
  const money = (n: number) =>
    new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ locale, project_id: projectId }} />
      <Field label={f.documentType} hint={hint}>
        <div className="grid grid-cols-5 gap-1 rounded-md bg-slate-100 p-1">
          {types.map((x) => (
            <label
              key={x}
              className="cursor-pointer rounded px-1 py-1.5 text-center text-2xs font-semibold text-muted has-checked:bg-surface has-checked:text-brand has-checked:shadow-sm"
            >
              <input
                type="radio"
                name="document_type"
                value={x}
                checked={type === x}
                onChange={() => setType(x)}
                className="sr-only"
              />
              {x}
            </label>
          ))}
        </div>
      </Field>
      <FormGrid>
        <Field label={f.documentDate}>
          <Input name="document_date" type="date" defaultValue={defaultDate} />
        </Field>
        <Field label={f.counterparty}>
          <Input name="counterparty_name" />
        </Field>
      </FormGrid>

      {needsCategory ? (
        <Field label={f.costCategory} required>
          <Select name="cost_category_id" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {isCash ? (
        <>
          <Field label={f.cashAccount} required>
            <Select name="cash_account_id" required defaultValue="">
              <option value="" disabled>
                —
              </option>
              {cashAccounts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={f.sourceDocument}>
            <Select
              name="source_document_id"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">{f.directTransaction}</option>
              {openInvoices
                .filter((d) => d.type === settles)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
            </Select>
          </Field>
          {type === "RECEIPT" && !source ? (
            <Field label={f.receiptPurpose}>
              <Select name="receipt_purpose" defaultValue="DIRECT_REVENUE">
                <option value="DIRECT_REVENUE">{t.status.receiptPurpose.DIRECT_REVENUE}</option>
                <option value="CUSTOMER_DEPOSIT">{t.status.receiptPurpose.CUSTOMER_DEPOSIT}</option>
              </Select>
            </Field>
          ) : null}
        </>
      ) : null}

      <FormGrid>
        <Field label={isInvoice ? f.baseAmount : isCash ? f.cashAmount : f.amount} required>
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {isInvoice ? (
          <Field label={f.vatRate}>
            <Input
              name="vat_rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={vat}
              onChange={(e) => setVat(e.target.value)}
            />
          </Field>
        ) : isCash ? (
          <Field label={f.whtRate}>
            <Input
              name="wht_rate"
              type="number"
              min="0"
              max="99"
              step="0.01"
              value={wht}
              onChange={(e) => setWht(e.target.value)}
            />
          </Field>
        ) : null}
      </FormGrid>

      {isInvoice || isCash ? (
        <div className="rounded-md border border-line bg-subtle px-3 py-2 text-2xs">
          <div className="flex justify-between">
            <span className="text-muted">{isInvoice ? f.baseAmount : f.cashAmount}</span>
            <span className="num">{money(base)}</span>
          </div>
          {isInvoice ? (
            <div className="flex justify-between">
              <span className="text-muted">{f.vatAmount}</span>
              <span className="num">{money(vatAmount)}</span>
            </div>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted">{f.whtAmount}</span>
              <span className="num">{money(whtAmount)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold">
            <span>{t.common.total}</span>
            <span className="num">{money(isInvoice ? base + vatAmount : base + whtAmount)}</span>
          </div>
        </div>
      ) : null}

      {isInvoice ? (
        <FormGrid>
          <Field label={f.taxInvoiceNo}>
            <Input name="tax_invoice_no" />
          </Field>
          <Field label={f.counterpartyTaxId}>
            <Input name="counterparty_tax_id" inputMode="numeric" maxLength={13} />
          </Field>
        </FormGrid>
      ) : null}

      <Field label={t.common.description}>
        <Textarea name="description" />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
