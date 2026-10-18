import { Landmark, Pencil } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import type { Locale } from "@/lib/i18n/config";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney } from "@/lib/format";
import {
  bankAccountTypes,
  bankPurposes,
  formatAccountNumber,
  thaiBanks,
  type BankAccount,
} from "@/lib/bank";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

type Actions = {
  save: (fd: FormData) => Promise<void>;
  setDefault: (fd: FormData) => Promise<void>;
  setActive: (fd: FormData) => Promise<void>;
};

function AccountForm({
  account,
  hidden,
  t,
  action,
}: {
  account?: BankAccount;
  hidden: Record<string, string>;
  t: Dictionary;
  action: Actions["save"];
}) {
  const b = t.bank;
  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, account_id: account?.id ?? "" }} />
      <FormGrid>
        <Field label={b.fields.bank} required>
          <Input
            name="bank_name"
            required
            list="thai-banks"
            defaultValue={account?.bank_name ?? ""}
          />
        </Field>
        <Field label={b.fields.branch}>
          <Input name="branch" defaultValue={account?.branch ?? ""} />
        </Field>
      </FormGrid>
      <Field label={b.fields.accountName} required>
        <Input name="account_name" required defaultValue={account?.account_name ?? ""} />
      </Field>
      <FormGrid>
        <Field label={b.fields.accountNumber} required hint={b.hints.accountNumber}>
          <Input
            name="account_number"
            required
            inputMode="numeric"
            pattern="[0-9\s\-]{10,20}"
            className="font-mono"
            defaultValue={formatAccountNumber(account?.account_number)}
          />
        </Field>
        <Field label={b.fields.accountType}>
          <Select name="account_type" defaultValue={account?.account_type ?? "SAVINGS"}>
            {bankAccountTypes.map((v) => (
              <option key={v} value={v}>
                {b.types[v]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={b.fields.purpose}>
          <Select name="purpose" defaultValue={account?.purpose ?? "CUSTOMER_RECEIPTS"}>
            {bankPurposes.map((v) => (
              <option key={v} value={v}>
                {b.purposes[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={b.fields.promptpay}>
          <Input
            name="promptpay_id"
            inputMode="numeric"
            className="font-mono"
            defaultValue={account?.promptpay_id ?? ""}
          />
        </Field>
      </FormGrid>
      {account ? null : (
        <FormGrid>
          <Field label={b.fields.openingBalance} hint={b.hints.openingBalance}>
            <Input name="opening_balance" type="number" step="0.01" defaultValue="0" />
          </Field>
          <Field label={b.fields.openingDate}>
            <Input name="opening_date" type="date" />
          </Field>
        </FormGrid>
      )}
      <Field label={b.fields.notes}>
        <Textarea name="notes" defaultValue={account?.notes ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="show_to_customers"
          defaultChecked={account?.show_to_customers ?? false}
        />
        {b.fields.showToCustomers}
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="is_default_receipt"
          defaultChecked={account?.is_default_receipt ?? false}
        />
        {b.fields.isDefault}
      </label>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}

/** A project's bank accounts: several per project, one main account for customer payments. */
export function BankAccountsPanel({
  accounts,
  locale,
  projectId,
  canManage,
  t,
  actions,
}: {
  accounts: BankAccount[];
  locale: Locale;
  projectId: string;
  canManage: boolean;
  t: Dictionary;
  actions: Actions;
}) {
  const b = t.bank;
  const hidden = { locale, project_id: projectId };
  const open = accounts.filter((a) => a.active);
  const closed = accounts.filter((a) => !a.active);

  const row = (a: BankAccount) => (
    <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
          <Landmark className="size-4" />
        </span>
        <div className="min-w-0 space-y-0.5 text-[13px]">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            {a.bank_name}
            {a.branch ? <span className="text-muted">· {a.branch}</span> : null}
            {a.is_default_receipt ? <Badge tone="info">{b.badges.default}</Badge> : null}
            {a.show_to_customers && a.active ? (
              <Badge tone="success">{b.badges.customers}</Badge>
            ) : null}
            {!a.active ? <Badge>{b.badges.closed}</Badge> : null}
          </p>
          <p className="font-mono text-sm tracking-wide text-ink">
            {formatAccountNumber(a.account_number) || a.account_number_masked}
          </p>
          <p className="text-2xs text-muted">
            {a.account_name} · {a.account_type ? label(b.types, a.account_type) : ""} ·{" "}
            {label(b.purposes, a.purpose)}
            {a.promptpay_id ? ` · ${b.customer.promptpay} ${a.promptpay_id}` : ""}
          </p>
          <p className="text-2xs text-faint">
            {a.code} · {b.fields.openingBalance} {formatMoney(locale, a.opening_balance)} (
            {formatDate(locale, a.opening_date)}){a.notes ? ` · ${a.notes}` : ""}
          </p>
        </div>
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {a.active ? (
            <>
              <Sheet
                title={b.edit}
                triggerLabel={b.edit}
                triggerIcon={<Pencil />}
                triggerSize="xs"
                triggerVariant="secondary"
              >
                <AccountForm account={a} hidden={hidden} t={t} action={actions.save} />
              </Sheet>
              {!a.is_default_receipt ? (
                <form action={actions.setDefault}>
                  <Hidden values={{ ...hidden, account_id: a.id }} />
                  <SubmitButton size="xs" variant="ghost">
                    {b.actions.makeDefault}
                  </SubmitButton>
                </form>
              ) : null}
              <form action={actions.setActive}>
                <Hidden values={{ ...hidden, account_id: a.id, active: "false" }} />
                <SubmitButton size="xs" variant="ghost" className="text-red-700">
                  {b.actions.close}
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={actions.setActive}>
              <Hidden values={{ ...hidden, account_id: a.id, active: "true" }} />
              <SubmitButton size="xs" variant="ghost">
                {b.actions.reopen}
              </SubmitButton>
            </form>
          )}
        </div>
      ) : null}
    </li>
  );

  return (
    <Panel
      title={b.title}
      actions={
        canManage ? (
          <Sheet title={b.add} triggerLabel={b.add} triggerVariant="secondary">
            <AccountForm hidden={hidden} t={t} action={actions.save} />
          </Sheet>
        ) : null
      }
    >
      <datalist id="thai-banks">
        {thaiBanks.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <p className="border-b border-line px-4 py-2 text-2xs text-muted">{b.subtitle}</p>
      {open.length ? (
        <ul className="divide-y divide-line">{open.map(row)}</ul>
      ) : (
        <EmptyState title={b.empty} body={b.emptyBody} />
      )}
      {closed.length ? (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2 text-2xs text-muted">
            {b.closed} ({closed.length})
          </summary>
          <ul className="divide-y divide-line opacity-70">{closed.map(row)}</ul>
        </details>
      ) : null}
    </Panel>
  );
}
