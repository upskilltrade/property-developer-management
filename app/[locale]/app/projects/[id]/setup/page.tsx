import { FileUp } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { label } from "@/lib/i18n/label";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import type { BankAccount } from "@/lib/bank";
import { BankAccountsPanel } from "@/components/domain/bank-accounts-panel";
import {
  addHouseType,
  addPhase,
  addPlot,
  saveBankAccount,
  saveUnitPrices,
  setBankAccountActive,
  setDefaultBankAccount,
} from "../actions";

export default async function ProjectSetup({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { supabase } = await getSession(locale);
  const hidden = <Hidden values={{ locale, project_id: id }} />;

  const [
    { data: project },
    { data: phases },
    { data: plots },
    { data: units },
    { data: bankAccounts },
    { data: canManageBank },
  ] = await Promise.all([
    supabase.from("projects").select("organization_id").eq("id", id).single(),
    supabase
      .from("phases")
      .select("id,code,name,sequence_no")
      .eq("project_id", id)
      .order("sequence_no"),
    supabase
      .from("plots")
      .select("id,code,land_area_sqm,phase_id")
      .eq("project_id", id)
      .order("code"),
    supabase
      .from("units")
      .select("id,code,status,list_price,phase_id,plot_id,house_type_id,house_types(code)")
      .eq("project_id", id)
      .order("code"),
    supabase
      .from("cash_accounts")
      .select(
        "id,code,bank_name,account_name,account_number,account_number_masked,branch,account_type,purpose,promptpay_id,show_to_customers,is_default_receipt,opening_balance,opening_date,notes,active",
      )
      .eq("project_id", id)
      .order("is_default_receipt", { ascending: false })
      .order("code"),
    supabase.rpc("can_manage_payment_schedule", { target_project: id }),
  ]);
  const { data: houseTypes } = project
    ? await supabase
        .from("house_types")
        .select("id,code,name,bedrooms,bathrooms,gross_floor_area_sqm")
        .eq("organization_id", project.organization_id)
        .order("code")
    : { data: [] };

  const unitList = units ?? [];
  const phaseCode = new Map((phases ?? []).map((p) => [p.id, p.code]));
  const unitsWhere = (key: "phase_id" | "plot_id" | "house_type_id", value: string) =>
    unitList.filter((u) => u[key] === value).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">{t.project.setupSubtitle}</p>
        <ButtonLink href={`/${locale}/app/projects/${id}/setup/import`} size="sm">
          <FileUp />
          {t.importData.open}
        </ButtonLink>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={t.project.phases}
          actions={
            <Sheet
              title={t.project.newPhase}
              triggerLabel={t.project.newPhase}
              triggerVariant="secondary"
            >
              <form action={addPhase} className="space-y-3">
                {hidden}
                <FormGrid>
                  <Field label={t.common.code} required>
                    <Input name="code" required placeholder="PH1" className="uppercase" />
                  </Field>
                  <Field label={t.project.fields.sequence}>
                    <Input
                      name="sequence_no"
                      type="number"
                      min="1"
                      defaultValue={(phases?.length ?? 0) + 1}
                    />
                  </Field>
                </FormGrid>
                <Field label={t.common.name} required>
                  <Input name="name" required />
                </Field>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          }
        >
          {phases?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH className="w-14">#</TH>
                  <TH>{t.common.code}</TH>
                  <TH>{t.common.name}</TH>
                  <TH align="right">{t.project.plots}</TH>
                  <TH align="right">{t.projects.fields.units}</TH>
                </tr>
              </THead>
              <tbody>
                {phases.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-muted num">{p.sequence_no}</TD>
                    <TD className="font-mono text-2xs">{p.code}</TD>
                    <TD className="font-medium">{p.name}</TD>
                    <TD align="right">
                      {formatNumber(
                        locale,
                        (plots ?? []).filter((x) => x.phase_id === p.id).length,
                      )}
                    </TD>
                    <TD align="right">{formatNumber(locale, unitsWhere("phase_id", p.id))}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title={t.project.noPhases} />
          )}
        </Panel>

        <Panel
          title={t.project.plots}
          actions={
            <Sheet
              title={t.project.newPlot}
              triggerLabel={t.project.newPlot}
              triggerVariant="secondary"
            >
              <form action={addPlot} className="space-y-3">
                {hidden}
                <FormGrid>
                  <Field label={t.common.code} required>
                    <Input name="code" required placeholder="L-01" className="uppercase" />
                  </Field>
                  <Field label={t.project.fields.landArea}>
                    <Input name="land_area_sqm" type="number" min="0" step="0.01" />
                  </Field>
                </FormGrid>
                <Field label={t.project.fields.phase}>
                  <Select name="phase_id" defaultValue="">
                    <option value="">—</option>
                    {(phases ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          }
        >
          {plots?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{t.common.code}</TH>
                  <TH>{t.project.fields.phase}</TH>
                  <TH align="right">{t.project.fields.landArea}</TH>
                  <TH align="right">{t.projects.fields.units}</TH>
                </tr>
              </THead>
              <tbody>
                {plots.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-2xs font-medium">{p.code}</TD>
                    <TD className="text-muted">{p.phase_id ? phaseCode.get(p.phase_id) : "—"}</TD>
                    <TD align="right">
                      {p.land_area_sqm != null ? formatNumber(locale, p.land_area_sqm, 2) : "—"}
                    </TD>
                    <TD align="right">{formatNumber(locale, unitsWhere("plot_id", p.id))}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title={t.project.noPlots} />
          )}
        </Panel>
      </div>

      <BankAccountsPanel
        accounts={(bankAccounts ?? []) as BankAccount[]}
        locale={locale}
        projectId={id}
        canManage={canManageBank === true}
        t={t}
        actions={{
          save: saveBankAccount,
          setDefault: setDefaultBankAccount,
          setActive: setBankAccountActive,
        }}
      />

      <Panel
        title={t.project.houseTypes}
        actions={
          <Sheet
            title={t.project.newHouseType}
            triggerLabel={t.project.newHouseType}
            triggerVariant="secondary"
          >
            <form action={addHouseType} className="space-y-3">
              {hidden}
              <FormGrid>
                <Field label={t.common.code} required>
                  <Input name="code" required placeholder="TYPE-A" className="uppercase" />
                </Field>
                <Field label={t.project.fields.gfa}>
                  <Input name="gross_floor_area_sqm" type="number" min="0" step="0.01" />
                </Field>
              </FormGrid>
              <Field label={t.common.name} required>
                <Input name="name" required />
              </Field>
              <FormGrid>
                <Field label={t.project.fields.bedrooms}>
                  <Input name="bedrooms" type="number" min="0" defaultValue={3} />
                </Field>
                <Field label={t.project.fields.bathrooms}>
                  <Input name="bathrooms" type="number" min="0" defaultValue={2} />
                </Field>
              </FormGrid>
              <SheetFooter>
                <SubmitButton>{t.common.save}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {houseTypes?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{t.common.code}</TH>
                <TH>{t.common.name}</TH>
                <TH align="right">{t.project.fields.bedrooms}</TH>
                <TH align="right">{t.project.fields.bathrooms}</TH>
                <TH align="right">{t.project.fields.gfa}</TH>
                <TH align="right">{t.projects.fields.units}</TH>
              </tr>
            </THead>
            <tbody>
              {houseTypes.map((h) => (
                <TR key={h.id}>
                  <TD className="font-mono text-2xs font-medium">{h.code}</TD>
                  <TD className="font-medium">{h.name}</TD>
                  <TD align="right">{formatNumber(locale, h.bedrooms)}</TD>
                  <TD align="right">{formatNumber(locale, h.bathrooms)}</TD>
                  <TD align="right">
                    {h.gross_floor_area_sqm != null
                      ? formatNumber(locale, h.gross_floor_area_sqm, 2)
                      : "—"}
                  </TD>
                  <TD align="right">{formatNumber(locale, unitsWhere("house_type_id", h.id))}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={t.project.noHouseTypes} />
        )}
      </Panel>

      {unitList.length ? (
        <Panel title={t.project.prices.title} description={t.project.prices.hint}>
          <form action={saveUnitPrices}>
            {hidden}
            <Table>
              <THead>
                <tr>
                  <TH>{t.projects.fields.units}</TH>
                  <TH>{t.project.fields.houseType}</TH>
                  <TH>{t.common.status}</TH>
                  <TH align="right">{t.project.fields.listPrice} (THB)</TH>
                </tr>
              </THead>
              <tbody>
                {unitList.map((u) => {
                  const ht = Array.isArray(u.house_types) ? u.house_types[0] : u.house_types;
                  const orig = u.list_price == null ? "" : String(Number(u.list_price));
                  return (
                    <TR key={u.id}>
                      <TD className="font-mono text-2xs font-medium">{u.code}</TD>
                      <TD className="text-2xs text-muted">{ht?.code ?? "—"}</TD>
                      <TD className="text-2xs">{label(t.status.unit, u.status)}</TD>
                      <TD align="right">
                        <input type="hidden" name={`orig:${u.id}`} value={orig} />
                        <Input
                          name={`price:${u.id}`}
                          inputMode="decimal"
                          defaultValue={orig ? formatNumber(locale, Number(orig)) : ""}
                          className="ml-auto max-w-44 text-right num"
                        />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <div className="flex justify-end border-t border-line px-4 py-3">
              <SubmitButton>{t.project.prices.save}</SubmitButton>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
