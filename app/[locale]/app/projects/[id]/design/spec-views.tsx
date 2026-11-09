import Link from "next/link";
import { ClipboardList, FilePlus2, Pencil, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { Dictionary, Locale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  changedFields,
  groupByCategory,
  lineAmount,
  specCategories,
  specKindTone,
  specTotals,
  type SpecLine,
} from "@/lib/spec";
import { cn } from "@/components/ui/cn";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/components/ui/print-button";
import {
  cancelUnitSpec,
  createSpecVariation,
  removeSpecItem,
  removeSpecOption,
  saveSpecItem,
  saveSpecOption,
  saveUnitSpec,
} from "./spec-actions";

type Item = {
  id: string;
  house_type_id: string | null;
  item_no: string;
  seq: number;
  category: string;
  area: string | null;
  name: string;
  description: string | null;
  material_id: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  supplier: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  warranty: string | null;
  note: string | null;
  active: boolean;
};

const ITEM_COLUMNS =
  "id,house_type_id,item_no,seq,category,area,name,description,material_id,brand,model,color,size,supplier,quantity,unit,unit_price,warranty,note,active";

type Option = {
  id: string;
  item_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  supplier: string | null;
  unit_price: number | string | null;
  customer_price: number | string | null;
  note: string | null;
  active: boolean;
};

type RawLine = {
  id: string;
  area: string | null;
  name: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  supplier: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  customer_price: number | string | null;
  note: string | null;
};

type Ctx = { locale: Locale; t: Dictionary; projectId: string; back: string };

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const dash = (v: string | null | undefined) => v || "—";

function money(locale: Locale, v: number | string | null | undefined) {
  return v === null || v === undefined || v === "" ? "—" : formatMoney(locale, v);
}

function signed(locale: Locale, v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const x = Number(v);
  if (!x) return "—";
  return `${x > 0 ? "+" : "−"}${formatMoney(locale, Math.abs(x))}`;
}

function CategorySelect({ t, defaultValue }: { t: Dictionary; defaultValue?: string }) {
  return (
    <Select name="category" defaultValue={defaultValue ?? "FLOOR"} required>
      {specCategories.map((c) => (
        <option key={c} value={c}>
          {t.spec.categories[c]}
        </option>
      ))}
    </Select>
  );
}

/** Size / colour / brand / model / supplier / quantity / unit / price inputs shared by every form. */
function DetailFields({
  t,
  values,
  placeholders,
  withQuantity = true,
}: {
  t: Dictionary;
  values?: Partial<Record<string, string | number | boolean | null>>;
  placeholders?: Partial<Record<string, string | number | null>>;
  withQuantity?: boolean;
}) {
  const s = t.spec;
  const v = (k: string) => (values?.[k] ?? "") as string;
  const ph = (k: string) => (placeholders?.[k] ?? "") as string;
  return (
    <>
      <FormGrid>
        <Field label={s.size}>
          <Input
            name="size"
            defaultValue={v("size")}
            placeholder={ph("size") || "60x60 cm / 1.20x2.10 m"}
          />
        </Field>
        <Field label={s.color}>
          <Input name="color" defaultValue={v("color")} placeholder={ph("color")} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={s.brand}>
          <Input name="brand" defaultValue={v("brand")} placeholder={ph("brand")} />
        </Field>
        <Field label={s.model}>
          <Input name="model" defaultValue={v("model")} placeholder={ph("model")} />
        </Field>
      </FormGrid>
      <Field label={s.supplier}>
        <Input name="supplier" defaultValue={v("supplier")} placeholder={ph("supplier")} />
      </Field>
      {withQuantity ? (
        <FormGrid cols={3}>
          <Field label={s.quantity}>
            <Input
              name="quantity"
              inputMode="decimal"
              defaultValue={v("quantity")}
              placeholder={ph("quantity")}
            />
          </Field>
          <Field label={s.unit}>
            <Input
              name="unit"
              defaultValue={v("unit")}
              placeholder={ph("unit") || "ตร.ม. / ชุด / จุด"}
            />
          </Field>
          <Field label={s.unitPrice}>
            <Input
              name="unit_price"
              inputMode="decimal"
              defaultValue={v("unit_price")}
              placeholder={ph("unit_price")}
            />
          </Field>
        </FormGrid>
      ) : null}
    </>
  );
}

function ItemForm({
  ctx,
  item,
  houseTypes,
  materials,
}: {
  ctx: Ctx;
  item?: Item;
  houseTypes: { id: string; code: string; name: string }[];
  materials: { id: string; code: string; name_th: string; brand: string | null }[];
}) {
  const { t, locale, projectId, back } = ctx;
  const s = t.spec;
  return (
    <form action={saveSpecItem} className="space-y-3">
      <Hidden values={{ locale, return_to: back, project_id: projectId, item_id: item?.id }} />
      <FormGrid cols={3}>
        <Field label={s.itemNo} required>
          <Input name="item_no" required defaultValue={item?.item_no} placeholder="FL-01" />
        </Field>
        <Field label={s.category} required>
          <CategorySelect t={t} defaultValue={item?.category} />
        </Field>
        <Field label={s.seq}>
          <Input name="seq" inputMode="numeric" defaultValue={item?.seq ?? ""} />
        </Field>
      </FormGrid>
      <Field label={s.name} required>
        <Input name="name" required defaultValue={item?.name} />
      </Field>
      <FormGrid>
        <Field label={s.area}>
          <Input name="area" defaultValue={item?.area ?? ""} placeholder={s.areaPlaceholder} />
        </Field>
        <Field label={s.houseType}>
          <Select name="house_type_id" defaultValue={item?.house_type_id ?? ""}>
            <option value="">{s.allHouseTypes}</option>
            {houseTypes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.code} · {h.name}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={s.description}>
        <Textarea name="description" defaultValue={item?.description ?? ""} />
      </Field>
      <DetailFields t={t} values={item ?? undefined} />
      <FormGrid>
        <Field label={s.warranty}>
          <Input name="warranty" defaultValue={item?.warranty ?? ""} />
        </Field>
        <Field label={s.material}>
          <Select name="material_id" defaultValue={item?.material_id ?? ""}>
            <option value="">—</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name_th}
                {m.brand ? ` (${m.brand})` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={s.note}>
        <Textarea name="note" defaultValue={item?.note ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}

function OptionForm({ ctx, itemId, option }: { ctx: Ctx; itemId: string; option?: Option }) {
  const { t, locale, back } = ctx;
  const s = t.spec;
  return (
    <form action={saveSpecOption} className="space-y-3">
      <Hidden values={{ locale, return_to: back, item_id: itemId, option_id: option?.id }} />
      <Field label={s.optionName} required>
        <Input name="name" required defaultValue={option?.name} placeholder={s.optionPlaceholder} />
      </Field>
      <DetailFields t={t} values={option} withQuantity={false} />
      <FormGrid>
        <Field label={s.optionPrice} hint={s.optionPriceHint}>
          <Input
            name="unit_price"
            inputMode="decimal"
            defaultValue={(option?.unit_price as string) ?? ""}
          />
        </Field>
        <Field label={s.customerPrice} hint={s.customerPriceHint}>
          <Input
            name="customer_price"
            inputMode="decimal"
            defaultValue={(option?.customer_price as string) ?? ""}
          />
        </Field>
      </FormGrid>
      <Field label={s.note}>
        <Textarea name="note" defaultValue={option?.note ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}

// ---------------------------------------------------------------- project standard

export async function StandardSpecView({
  ctx,
  organizationId,
}: {
  ctx: Ctx;
  organizationId: string;
}) {
  const { t, locale, projectId, back } = ctx;
  const s = t.spec;
  const { supabase } = await getSession(locale);
  const [{ data: items }, { data: options }, { data: houseTypes }, { data: materials }] =
    await Promise.all([
      supabase
        .from("spec_items")
        .select(ITEM_COLUMNS)
        .eq("project_id", projectId)
        .eq("active", true)
        .order("seq")
        .order("item_no"),
      supabase
        .from("spec_options")
        .select(
          "id,item_id,name,brand,model,color,size,supplier,unit_price,customer_price,note,active",
        )
        .eq("project_id", projectId)
        .eq("active", true)
        .order("seq"),
      supabase
        .from("house_types")
        .select("id,code,name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("code"),
      supabase
        .from("materials")
        .select("id,code,name_th,brand")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("code"),
    ]);
  const rows = (items ?? []) as Item[];
  const opts = (options ?? []) as Option[];
  const htById = new Map((houseTypes ?? []).map((h) => [h.id, h]));
  const total = rows.reduce((sum, r) => sum + (lineAmount(r.quantity, r.unit_price) ?? 0), 0);
  const unpriced = rows.filter((r) => lineAmount(r.quantity, r.unit_price) === null).length;

  return (
    <Panel
      title={s.views.standard}
      description={s.standardHint}
      actions={
        <>
          <PrintButton label={s.print} />
          <Sheet
            title={s.newItem}
            triggerLabel={s.newItem}
            triggerIcon={<Plus />}
            triggerSize="xs"
            width="lg"
          >
            <ItemForm ctx={ctx} houseTypes={houseTypes ?? []} materials={materials ?? []} />
          </Sheet>
        </>
      }
    >
      {rows.length ? (
        <>
          <Table>
            <THead>
              <tr>
                <TH className="print:hidden">{t.common.actions}</TH>
                <TH>{s.itemNo}</TH>
                <TH>{s.name}</TH>
                <TH>{s.size}</TH>
                <TH>{s.color}</TH>
                <TH>{s.brandModel}</TH>
                <TH>{s.supplier}</TH>
                <TH align="right">{s.quantity}</TH>
                <TH align="right">{s.unitPrice}</TH>
                <TH align="right">{s.amount}</TH>
                <TH>{s.options}</TH>
              </tr>
            </THead>
            {groupByCategory(rows).map((g) => {
              const sub = g.items.reduce(
                (sum, r) => sum + (lineAmount(r.quantity, r.unit_price) ?? 0),
                0,
              );
              return (
                <tbody key={g.category}>
                  <tr className="bg-subtle">
                    <td colSpan={9} className="px-3 py-1.5 text-2xs font-semibold text-ink-2">
                      {label(s.categories, g.category)}
                    </td>
                    <td className="num px-3 py-1.5 text-right text-2xs font-semibold">
                      {sub ? formatMoney(locale, sub) : "—"}
                    </td>
                    <td />
                  </tr>
                  {g.items.map((r) => {
                    const itemOpts = opts.filter((o) => o.item_id === r.id);
                    const ht = r.house_type_id ? htById.get(r.house_type_id) : null;
                    return (
                      <TR key={r.id}>
                        <TD className="print:hidden">
                          <div className="flex items-center gap-1">
                            <Sheet
                              title={`${s.editItem} · ${r.item_no}`}
                              triggerLabel={t.common.edit}
                              triggerIcon={<Pencil />}
                              triggerVariant="ghost"
                              triggerSize="xs"
                              width="lg"
                            >
                              <ItemForm
                                ctx={ctx}
                                item={r}
                                houseTypes={houseTypes ?? []}
                                materials={materials ?? []}
                              />
                            </Sheet>
                            <Sheet
                              title={`${s.remove} · ${r.item_no}`}
                              description={s.removeHint}
                              triggerLabel={s.remove}
                              triggerIcon={<Trash2 />}
                              triggerVariant="ghost"
                              triggerSize="xs"
                            >
                              <form action={removeSpecItem}>
                                <Hidden values={{ locale, return_to: back, item_id: r.id }} />
                                <SheetFooter>
                                  <SubmitButton variant="danger">{s.remove}</SubmitButton>
                                </SheetFooter>
                              </form>
                            </Sheet>
                          </div>
                        </TD>
                        <TD className="font-mono text-[12px] font-semibold">{r.item_no}</TD>
                        <TD className="min-w-56 whitespace-normal">
                          {r.name}
                          <p className="text-2xs text-muted">
                            {join(r.area, ht?.code, r.description)}
                          </p>
                          {r.warranty || r.note ? (
                            <p className="text-[10px] text-faint">{join(r.warranty, r.note)}</p>
                          ) : null}
                        </TD>
                        <TD className="text-muted">{dash(r.size)}</TD>
                        <TD className="text-muted">{dash(r.color)}</TD>
                        <TD>{dash(join(r.brand, r.model))}</TD>
                        <TD className="text-muted">{dash(r.supplier)}</TD>
                        <TD align="right" className="num">
                          {r.quantity !== null ? formatNumber(locale, r.quantity, 2) : "—"}{" "}
                          <span className="text-2xs text-muted">{r.unit}</span>
                        </TD>
                        <TD align="right">{money(locale, r.unit_price)}</TD>
                        <TD align="right" className="font-medium">
                          {money(locale, lineAmount(r.quantity, r.unit_price))}
                        </TD>
                        <TD>
                          <Sheet
                            title={`${s.options} · ${r.item_no} ${r.name}`}
                            description={s.optionsHint}
                            triggerLabel={itemOpts.length ? String(itemOpts.length) : s.addOption}
                            triggerIcon={<Sparkles />}
                            triggerVariant="ghost"
                            triggerSize="xs"
                            width="lg"
                          >
                            <div className="space-y-4">
                              {itemOpts.length ? (
                                <ul className="divide-y divide-line rounded-md border border-line">
                                  {itemOpts.map((o) => (
                                    <li key={o.id} className="px-3 py-2 text-[13px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium">{o.name}</span>
                                        <form action={removeSpecOption}>
                                          <Hidden
                                            values={{ locale, return_to: back, option_id: o.id }}
                                          />
                                          <SubmitButton size="xs" variant="ghost">
                                            <Trash2 />
                                          </SubmitButton>
                                        </form>
                                      </div>
                                      <p className="text-2xs text-muted">
                                        {join(o.brand, o.model, o.color, o.size, o.supplier)}
                                      </p>
                                      <p className="text-2xs">
                                        {s.optionPrice}: {money(locale, o.unit_price)} ·{" "}
                                        {s.customerPrice}:{" "}
                                        {o.customer_price !== null
                                          ? signed(locale, o.customer_price)
                                          : s.byCostDifference}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-2xs text-muted">{s.noOptions}</p>
                              )}
                              <h3 className="text-[13px] font-semibold">{s.newOption}</h3>
                              <OptionForm ctx={ctx} itemId={r.id} />
                            </div>
                          </Sheet>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              );
            })}
          </Table>
          <div className="flex flex-wrap items-center justify-end gap-4 border-t border-line px-4 py-2.5 text-[13px]">
            {unpriced ? (
              <span className="text-2xs text-amber-700">
                {s.unpriced}: {unpriced}
              </span>
            ) : null}
            <span>
              {s.total}: <strong className="num">{formatMoney(locale, total)}</strong>
            </span>
          </div>
        </>
      ) : (
        <EmptyState icon={<ClipboardList />} title={s.noItems} body={s.noItemsHint} />
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- one unit

export async function UnitSpecView({
  ctx,
  units,
  unitId,
  organizationId,
}: {
  ctx: Ctx;
  units: { id: string; code: string }[];
  unitId: string | undefined;
  organizationId: string;
}) {
  const { t, locale, projectId } = ctx;
  const s = t.spec;
  if (!units.length) return <EmptyState icon={<ClipboardList />} title={s.noUnits} />;
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const base = `/${locale}/app/projects/${projectId}/design?view=unitspec`;
  const back = `${base}&unit=${unit.id}`;
  const uctx = { ...ctx, back };
  const { supabase } = await getSession(locale);
  const [
    { data: lineData, error },
    { data: options },
    { data: raw },
    { data: items },
    { data: houseTypes },
    { data: materials },
  ] = await Promise.all([
    supabase.rpc("unit_spec_lines", { target_unit: unit.id }),
    supabase
      .from("spec_options")
      .select(
        "id,item_id,name,brand,model,color,size,supplier,unit_price,customer_price,note,active",
      )
      .eq("project_id", projectId)
      .eq("active", true)
      .order("seq"),
    supabase
      .from("unit_spec_items")
      .select(
        "id,area,name,description,brand,model,color,size,supplier,quantity,unit,unit_price,customer_price,note",
      )
      .eq("unit_id", unit.id)
      .neq("status", "CANCELLED"),
    supabase.from("spec_items").select(ITEM_COLUMNS).eq("project_id", projectId),
    supabase
      .from("house_types")
      .select("id,code,name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("code"),
    supabase
      .from("materials")
      .select("id,code,name_th,brand")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("code"),
  ]);
  const itemById = new Map(((items ?? []) as Item[]).map((i) => [i.id, i]));
  const rawById = new Map((raw ?? []).map((r) => [r.id as string, r as RawLine]));
  const lines = (error ? [] : (lineData ?? [])) as SpecLine[];
  const opts = (options ?? []) as Option[];
  const totals = specTotals(lines);

  return (
    <div className="space-y-4">
      <Tabs
        active={unit.id}
        items={units.map((u) => ({ key: u.id, label: u.code, href: `${base}&unit=${u.id}` }))}
      />
      <KpiStrip cols={5}>
        <Kpi label={s.standardTotal} value={formatMoney(locale, totals.standard)} />
        <Kpi label={s.currentTotal} value={formatMoney(locale, totals.current)} />
        <Kpi
          label={s.costDelta}
          value={signed(locale, totals.costDelta)}
          tone={totals.costDelta > 0 ? "negative" : "default"}
        />
        <Kpi
          label={s.charge}
          value={signed(locale, totals.charge)}
          sub={`${s.changes}: ${totals.changes}`}
          tone={totals.charge > 0 ? "positive" : "default"}
        />
        <Kpi
          label={s.draftCharge}
          value={signed(locale, totals.draftCharge)}
          sub={`${s.drafts}: ${totals.drafts}`}
          tone="brand"
        />
      </KpiStrip>

      <Panel
        title={`${s.views.unit} · ${unit.code}`}
        description={s.unitHint}
        actions={
          <>
            <PrintButton label={s.print} />
            <Sheet
              title={`${s.addItem} · ${unit.code}`}
              triggerLabel={s.addItem}
              triggerIcon={<Plus />}
              triggerVariant="secondary"
              triggerSize="xs"
              width="lg"
            >
              <form action={saveUnitSpec} className="space-y-3">
                <Hidden values={{ locale, return_to: back, unit_id: unit.id, kind: "ADD" }} />
                <FormGrid>
                  <Field label={s.category} required>
                    <CategorySelect t={t} defaultValue="OTHER" />
                  </Field>
                  <Field label={s.area}>
                    <Input name="area" placeholder={s.areaPlaceholder} />
                  </Field>
                </FormGrid>
                <Field label={s.name} required>
                  <Input name="name" required />
                </Field>
                <Field label={s.description}>
                  <Textarea name="description" />
                </Field>
                <DetailFields t={t} />
                <Field label={s.customerPrice} hint={s.addPriceHint}>
                  <Input name="customer_price" inputMode="decimal" />
                </Field>
                <Field label={s.note}>
                  <Textarea name="note" />
                </Field>
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
            {totals.drafts ? (
              <Sheet
                title={s.createVo}
                description={s.createVoHint}
                triggerLabel={s.createVo}
                triggerIcon={<FilePlus2 />}
                triggerSize="xs"
              >
                <form action={createSpecVariation} className="space-y-3">
                  <Hidden
                    values={{ locale, return_to: back, unit_id: unit.id, project_id: projectId }}
                  />
                  <Field label={s.voTitle}>
                    <Input name="title" defaultValue={`${s.voDefaultTitle} ${unit.code}`} />
                  </Field>
                  <p className="text-2xs text-muted">
                    {s.drafts}: {totals.drafts} · {s.charge}: {signed(locale, totals.draftCharge)}
                  </p>
                  <SheetFooter>
                    <SubmitButton>{s.createVo}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            ) : null}
          </>
        }
      >
        {lines.length ? (
          <Table>
            <THead>
              <tr>
                <TH className="print:hidden">{t.common.actions}</TH>
                <TH>{s.itemNo}</TH>
                <TH>{s.name}</TH>
                <TH>{s.specColumn}</TH>
                <TH align="right">{s.quantity}</TH>
                <TH align="right">{s.unitPrice}</TH>
                <TH align="right">{s.amount}</TH>
                <TH align="right">{s.costDelta}</TH>
                <TH align="right">{s.charge}</TH>
                <TH>{t.common.status}</TH>
              </tr>
            </THead>
            {groupByCategory(lines).map((g) => (
              <tbody key={g.category}>
                <tr className="bg-subtle">
                  <td colSpan={10} className="px-3 py-1.5 text-2xs font-semibold text-ink-2">
                    {label(s.categories, g.category)}
                  </td>
                </tr>
                {g.items.map((l) => (
                  <UnitLine
                    key={l.line_id ?? l.base_item_id}
                    ctx={uctx}
                    unitId={unit.id}
                    line={l}
                    options={opts.filter((o) => o.item_id === l.base_item_id)}
                    raw={l.line_id ? rawById.get(l.line_id) : undefined}
                    std={l.base_item_id ? itemById.get(l.base_item_id) : undefined}
                    houseTypes={houseTypes ?? []}
                    materials={materials ?? []}
                  />
                ))}
              </tbody>
            ))}
          </Table>
        ) : (
          <EmptyState icon={<ClipboardList />} title={s.noItems} body={s.noItemsHint} />
        )}
      </Panel>
    </div>
  );
}

function UnitLine({
  ctx,
  unitId,
  line: l,
  options,
  raw,
  std,
  houseTypes,
  materials,
}: {
  ctx: Ctx;
  unitId: string;
  line: SpecLine;
  options: Option[];
  raw?: RawLine;
  std?: Item;
  houseTypes: { id: string; code: string; name: string }[];
  materials: { id: string; code: string; name_th: string; brand: string | null }[];
}) {
  const { t, locale, projectId, back } = ctx;
  const s = t.spec;
  const was = changedFields(l);
  const canChange = l.kind === "STANDARD" || l.editable;
  const fieldLabel: Record<string, string> = {
    brand: s.brand,
    model: s.model,
    color: s.color,
    size: s.size,
    supplier: s.supplier,
  };
  return (
    <TR className={l.kind === "OMIT" ? "text-muted" : undefined}>
      <TD className="print:hidden">
        {canChange ? (
          <div className="flex flex-wrap items-center gap-1">
            {std ? (
              <Sheet
                title={`${s.editItem} · ${std.item_no}`}
                description={s.editStandardHint}
                triggerLabel={s.editStandard}
                triggerIcon={<Pencil />}
                triggerVariant="ghost"
                triggerSize="xs"
                width="lg"
              >
                <ItemForm ctx={ctx} item={std} houseTypes={houseTypes} materials={materials} />
              </Sheet>
            ) : null}
            {l.kind !== "OMIT" ? (
              <Sheet
                title={`${l.kind === "ADD" ? t.common.edit : s.upgrade} · ${l.name}`}
                description={l.kind === "ADD" ? undefined : s.changeHint}
                triggerLabel={l.kind === "ADD" ? t.common.edit : s.upgrade}
                triggerIcon={l.kind === "ADD" ? <Pencil /> : <Sparkles />}
                triggerVariant="ghost"
                triggerSize="xs"
                width="lg"
              >
                <form action={saveUnitSpec} className="space-y-3">
                  <Hidden
                    values={{
                      locale,
                      return_to: back,
                      unit_id: unitId,
                      line_id: l.line_id,
                      kind: l.kind === "ADD" ? "ADD" : "CHANGE",
                      base_item_id: l.base_item_id,
                    }}
                  />
                  {l.kind === "ADD" ? (
                    <>
                      <FormGrid>
                        <Field label={s.category} required>
                          <CategorySelect t={t} defaultValue={l.category} />
                        </Field>
                        <Field label={s.area}>
                          <Input name="area" defaultValue={l.area ?? ""} />
                        </Field>
                      </FormGrid>
                      <Field label={s.name} required>
                        <Input name="name" required defaultValue={l.name} />
                      </Field>
                      <Field label={s.description}>
                        <Textarea name="description" defaultValue={l.description ?? ""} />
                      </Field>
                      <DetailFields t={t} values={raw} />
                    </>
                  ) : (
                    <>
                      {options.length ? (
                        <Field label={s.option}>
                          <Select name="option_id" defaultValue={l.option_id ?? ""}>
                            <option value="">{s.noOption}</option>
                            {options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                                {o.customer_price !== null
                                  ? ` (${signed(locale, o.customer_price)})`
                                  : ""}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ) : null}
                      <DetailFields
                        t={t}
                        values={l.kind === "CHANGE" ? raw : undefined}
                        placeholders={{
                          brand: l.std_brand,
                          model: l.std_model,
                          color: l.std_color,
                          size: l.std_size,
                          supplier: l.std_supplier,
                          quantity: l.std_quantity as string,
                          unit: l.unit,
                          unit_price: l.std_unit_price as string,
                        }}
                      />
                    </>
                  )}
                  <Field label={s.customerPrice} hint={s.customerPriceHint}>
                    <Input
                      name="customer_price"
                      inputMode="decimal"
                      defaultValue={(raw?.customer_price as string) ?? ""}
                    />
                  </Field>
                  <Field label={s.note}>
                    <Textarea name="note" defaultValue={raw?.note ?? ""} />
                  </Field>
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            ) : null}
            {l.kind === "STANDARD" || l.kind === "CHANGE" ? (
              <Sheet
                title={`${s.omit} · ${l.name}`}
                description={s.omitHint}
                triggerLabel={s.omit}
                triggerIcon={<Trash2 />}
                triggerVariant="ghost"
                triggerSize="xs"
              >
                <form action={saveUnitSpec} className="space-y-3">
                  <Hidden
                    values={{
                      locale,
                      return_to: back,
                      unit_id: unitId,
                      line_id: l.line_id,
                      kind: "OMIT",
                      base_item_id: l.base_item_id,
                    }}
                  />
                  <Field label={s.customerPrice} hint={s.omitPriceHint}>
                    <Input name="customer_price" inputMode="decimal" />
                  </Field>
                  <Field label={s.note}>
                    <Textarea name="note" />
                  </Field>
                  <SheetFooter>
                    <SubmitButton variant="danger">{s.omit}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            ) : null}
            {l.line_id ? (
              <form action={cancelUnitSpec}>
                <Hidden values={{ locale, return_to: back, line_id: l.line_id }} />
                <SubmitButton size="xs" variant="ghost" title={s.backToStandard}>
                  <Undo2 />
                  {l.kind === "ADD" ? s.remove : s.backToStandard}
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-2xs text-faint">{s.locked}</span>
            {std ? (
              <Sheet
                title={`${s.editItem} · ${std.item_no}`}
                description={s.editStandardHint}
                triggerLabel={s.editStandard}
                triggerIcon={<Pencil />}
                triggerVariant="ghost"
                triggerSize="xs"
                width="lg"
              >
                <ItemForm ctx={ctx} item={std} houseTypes={houseTypes} materials={materials} />
              </Sheet>
            ) : null}
          </div>
        )}
      </TD>
      <TD className="font-mono text-[12px] font-semibold">{l.kind === "ADD" ? "+" : l.item_no}</TD>
      <TD
        className={cn(
          "min-w-56 whitespace-normal",
          l.kind === "OMIT" && "line-through decoration-faint",
        )}
      >
        {l.name}
        <p className="text-2xs text-muted">{join(l.area, l.description)}</p>
        {l.option_name ? (
          <p className="text-2xs text-brand">
            {s.option}: {l.option_name}
          </p>
        ) : null}
      </TD>
      <TD className="min-w-44 whitespace-normal">
        {dash(join(l.brand, l.model, l.color, l.size))}
        {l.supplier ? <p className="text-2xs text-muted">{l.supplier}</p> : null}
        {was.length ? (
          <p className="text-[10px] text-faint">
            {s.was}: {was.map((w) => `${fieldLabel[w.field]} ${w.was ?? "—"}`).join(" · ")}
          </p>
        ) : null}
      </TD>
      <TD align="right" className="num">
        {l.quantity !== null ? formatNumber(locale, l.quantity, 2) : "—"}{" "}
        <span className="text-2xs text-muted">{l.unit}</span>
      </TD>
      <TD align="right">{money(locale, l.unit_price)}</TD>
      <TD align="right" className="font-medium">
        {money(locale, l.amount)}
      </TD>
      <TD align="right">{l.kind === "STANDARD" ? "—" : signed(locale, l.cost_delta)}</TD>
      <TD align="right" className="font-medium">
        {l.kind === "STANDARD" ? "—" : signed(locale, l.charge)}
      </TD>
      <TD>
        <div className="flex flex-col items-start gap-0.5">
          <Badge tone={specKindTone[l.kind] ?? "neutral"}>{label(s.kinds, l.kind)}</Badge>
          {l.kind !== "STANDARD" ? (
            l.variation_order_id && !l.editable ? (
              <Link
                href={`/${locale}/app/projects/${projectId}/changes/${l.variation_order_id}`}
                className="text-2xs text-brand hover:underline"
              >
                {l.vo_no} · {label(t.status.vo, l.vo_status ?? "")}
              </Link>
            ) : (
              <span className="text-2xs text-muted">{s.statuses.DRAFT}</span>
            )
          ) : null}
        </div>
      </TD>
    </TR>
  );
}
