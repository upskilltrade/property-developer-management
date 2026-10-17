import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePlus2, Receipt, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { budgetTone, claimTone, poTone, prTone } from "@/lib/procurement";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";
import {
  cancelOrder,
  certifyClaim,
  createRequest,
  decideBudget,
  decideOrder,
  newBudgetVersion,
  receiveOrder,
  removeBoqItem,
  saveBoqItem,
  setThreshold,
  submitBudget,
  submitClaim,
} from "./actions";

export const metadata: Metadata = { title: "Cost & purchasing" };

const views = ["cost", "boq", "requests", "orders", "claims"] as const;
type View = (typeof views)[number];
type CostRow = {
  cost_category_id: string;
  code: string;
  name: string;
  baseline: number;
  committed: number;
  actual: number;
  certified: number;
  forecast: number;
  variance: number;
};

/** Cost control and purchasing for one project. All of it is internal (RLS: cost/procurement staff). */
export default async function ProjectProcurement({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string; unit?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const q = await searchParams;
  const view: View = (views as readonly string[]).includes(q.view ?? "")
    ? (q.view as View)
    : "cost";
  const { supabase, ownerOrganizationId } = await getSession(locale);
  const p = t.procurement;
  const base = `/${locale}/app/projects/${id}/procurement`;
  const back = `${base}?view=${view}`;
  const today = new Date().toISOString().slice(0, 10);

  const { data: project } = await supabase
    .from("projects")
    .select("id,organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const [{ data: units }, { data: categories }, { data: partners }] = await Promise.all([
    supabase.from("units").select("id,code").eq("project_id", id).order("code"),
    supabase.from("cost_categories").select("id,code,name").eq("active", true).order("code"),
    supabase
      .from("partner_organizations")
      .select("id,name,partner_type")
      .eq("status", "ACTIVE")
      .order("name"),
  ]);
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));
  const catLabel = new Map((categories ?? []).map((c) => [c.id, `${c.code} · ${c.name}`]));
  const partnerName = new Map((partners ?? []).map((x) => [x.id, x.name]));
  const ctx = { locale, return_to: back, project_id: id };
  const money = (v: unknown) => formatMoney(locale, v);

  const categorySelect = (name = "cost_category_id", value?: string) => (
    <Select
      name={name}
      required
      defaultValue={value ?? categories?.find((c) => c.code === "HOUSE")?.id ?? categories?.[0]?.id}
    >
      {(categories ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.code} · {c.name}
        </option>
      ))}
    </Select>
  );
  const unitSelect = (name = "unit_id", value = "") => (
    <Select name={name} defaultValue={value}>
      <option value="">{p.allUnits}</option>
      {(units ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.code}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-4">
      <Tabs
        active={view}
        items={views.map((v) => ({ key: v, label: p.views[v], href: `${base}?view=${v}` }))}
      />
      {view === "cost" ? <Cost /> : null}
      {view === "boq" ? <Boq /> : null}
      {view === "requests" ? <Requests /> : null}
      {view === "orders" ? <Orders /> : null}
      {view === "claims" ? <Claims /> : null}
    </div>
  );

  async function Cost() {
    const [{ data }, { data: settings }] = await Promise.all([
      supabase.rpc("get_cost_report", { target_project: id, target_unit: q.unit || null }),
      supabase.from("procurement_settings").select("owner_approval_above").maybeSingle(),
    ]);
    const rows = ((data ?? []) as CostRow[]).filter(
      (r) =>
        toNumber(r.baseline) ||
        toNumber(r.committed) ||
        toNumber(r.actual) ||
        toNumber(r.certified),
    );
    const sum = (k: keyof CostRow) => rows.reduce((s, r) => s + toNumber(r[k]), 0);
    return (
      <Panel
        title={p.views.cost}
        actions={
          <form className="flex items-center gap-1">
            <input type="hidden" name="view" value="cost" />
            <Select name="unit" defaultValue={q.unit ?? ""} className="h-7 w-32 text-2xs">
              <option value="">{p.allUnits}</option>
              {(units ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </Select>
            <button type="submit" className="h-7 rounded border border-line-strong px-2 text-2xs">
              {t.common.filter}
            </button>
          </form>
        }
      >
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{p.costCode}</TH>
                <TH align="right">{p.baseline}</TH>
                <TH align="right">{p.committed}</TH>
                <TH align="right">{p.actual}</TH>
                <TH align="right">{p.certified}</TH>
                <TH align="right">{p.forecast}</TH>
                <TH align="right">{p.variance}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.cost_category_id}>
                  <TD>
                    <span className="font-mono text-[12px] font-semibold">{r.code}</span>{" "}
                    <span className="text-muted">{r.name}</span>
                  </TD>
                  <TD align="right">{money(r.baseline)}</TD>
                  <TD align="right">{money(r.committed)}</TD>
                  <TD align="right">{money(r.actual)}</TD>
                  <TD align="right" className="text-muted">
                    {money(r.certified)}
                  </TD>
                  <TD align="right">{money(r.forecast)}</TD>
                  <TD
                    align="right"
                    className={cn(
                      "font-medium",
                      toNumber(r.variance) < 0 ? "text-red-600" : "text-emerald-700",
                    )}
                  >
                    {money(r.variance)}
                  </TD>
                </TR>
              ))}
              <TR>
                <TD className="font-semibold">{p.total}</TD>
                <TD align="right" className="font-semibold">
                  {money(sum("baseline"))}
                </TD>
                <TD align="right" className="font-semibold">
                  {money(sum("committed"))}
                </TD>
                <TD align="right" className="font-semibold">
                  {money(sum("actual"))}
                </TD>
                <TD align="right" className="font-semibold">
                  {money(sum("certified"))}
                </TD>
                <TD align="right" className="font-semibold">
                  {money(sum("forecast"))}
                </TD>
                <TD
                  align="right"
                  className={cn(
                    "font-semibold",
                    sum("variance") < 0 ? "text-red-600" : "text-emerald-700",
                  )}
                >
                  {money(sum("variance"))}
                </TD>
              </TR>
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Wallet />} title={p.noBudget} />
        )}
        {ownerOrganizationId ? (
          <form
            action={setThreshold}
            className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3"
          >
            <Hidden values={{ ...ctx, organization_id: project!.organization_id }} />
            <Field label={p.threshold} className="w-72">
              <Input
                name="amount"
                type="number"
                min="0"
                step="1000"
                defaultValue={settings?.owner_approval_above ?? 100000}
              />
            </Field>
            <SubmitButton size="sm" variant="secondary">
              {t.common.save}
            </SubmitButton>
          </form>
        ) : null}
      </Panel>
    );
  }

  async function Boq() {
    const { data: versions } = await supabase
      .from("budget_versions")
      .select("id,version,status,note,review_note,created_at,approved_at")
      .eq("project_id", id)
      .order("version", { ascending: false });
    const current =
      (versions ?? []).find((v) => v.status === "DRAFT" || v.status === "SUBMITTED") ??
      (versions ?? []).find((v) => v.status === "APPROVED") ??
      versions?.[0];
    const { data: items } = current
      ? await supabase
          .from("boq_items")
          .select("id,cost_category_id,unit_id,item_code,description,uom,quantity,rate,amount")
          .eq("budget_version_id", current.id)
          .is("removed_at", null)
          .order("created_at")
      : { data: [] };
    const editable = current?.status === "DRAFT";
    const hasOpen = (versions ?? []).some((v) => v.status === "DRAFT" || v.status === "SUBMITTED");
    const total = (items ?? []).reduce((s, i) => s + toNumber(i.amount), 0);
    const byCat = [...new Set((items ?? []).map((i) => i.cost_category_id))];
    const itemForm = (item?: (typeof items & object)[number]) => (
      <form action={saveBoqItem} className="space-y-3">
        <Hidden values={{ ...ctx, version_id: current!.id, item_id: item?.id ?? "" }} />
        <FormGrid>
          <Field label={p.costCode} required>
            {categorySelect("cost_category_id", item?.cost_category_id)}
          </Field>
          <Field label={p.unit}>{unitSelect("unit_id", item?.unit_id ?? "")}</Field>
        </FormGrid>
        <FormGrid>
          <Field label={p.itemCode}>
            <Input name="item_code" defaultValue={item?.item_code ?? ""} />
          </Field>
          <Field label={p.description} required>
            <Input name="description" required defaultValue={item?.description ?? ""} />
          </Field>
        </FormGrid>
        <FormGrid cols={3}>
          <Field label={p.uom}>
            <Input name="uom" defaultValue={item?.uom ?? "LS"} />
          </Field>
          <Field label={p.quantity} required>
            <Input
              name="quantity"
              type="number"
              min="0"
              step="any"
              required
              defaultValue={item?.quantity ?? 1}
            />
          </Field>
          <Field label={p.rate} required>
            <Input
              name="rate"
              type="number"
              min="0"
              step="any"
              required
              defaultValue={item?.rate ?? 0}
            />
          </Field>
        </FormGrid>
        <SheetFooter>
          <SubmitButton>{t.common.save}</SubmitButton>
        </SheetFooter>
      </form>
    );
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(versions ?? []).map((v) => (
            <Badge key={v.id} tone={budgetTone[v.status] ?? "neutral"}>
              {p.budgetVersion} {v.version} · {label(t.status.budgetVersion, v.status)}
            </Badge>
          ))}
          {!hasOpen ? (
            <form action={newBudgetVersion} className="ml-auto flex items-center gap-1">
              <Hidden values={ctx} />
              <Input name="note" placeholder={p.note} className="h-8 w-48" />
              <SubmitButton size="sm">
                <FilePlus2 />
                {p.newVersion}
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {current ? (
          <Panel
            title={`${p.budgetVersion} ${current.version} · ${money(total)}`}
            description={
              current.review_note
                ? `${p.reason}: ${current.review_note}`
                : (current.note ?? undefined)
            }
            actions={
              <div className="flex items-center gap-2">
                <Badge tone={budgetTone[current.status] ?? "neutral"}>
                  {label(t.status.budgetVersion, current.status)}
                </Badge>
                {editable ? (
                  <>
                    <Sheet
                      title={p.addItem}
                      triggerLabel={p.addItem}
                      triggerVariant="secondary"
                      triggerSize="xs"
                    >
                      {itemForm()}
                    </Sheet>
                    <form action={submitBudget}>
                      <Hidden values={{ ...ctx, version_id: current.id }} />
                      <SubmitButton size="xs">{p.submit}</SubmitButton>
                    </form>
                  </>
                ) : null}
                {current.status === "SUBMITTED" ? (
                  <form action={decideBudget} className="flex items-center gap-1">
                    <Hidden values={{ ...ctx, version_id: current.id }} />
                    <Input name="note" placeholder={p.reason} className="h-6 w-32 text-2xs" />
                    <SubmitButton size="xs" variant="success" name="decision" value="approve">
                      {p.approve}
                    </SubmitButton>
                    <SubmitButton size="xs" variant="danger" name="decision" value="reject">
                      {p.reject}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            }
          >
            {items?.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{p.itemCode}</TH>
                    <TH>{p.description}</TH>
                    <TH>{p.unit}</TH>
                    <TH align="right">{p.quantity}</TH>
                    <TH>{p.uom}</TH>
                    <TH align="right">{p.rate}</TH>
                    <TH align="right">{p.amount}</TH>
                    {editable ? <TH /> : null}
                  </tr>
                </THead>
                <tbody>
                  {byCat.map((cat) => {
                    const list = (items ?? []).filter((i) => i.cost_category_id === cat);
                    return [
                      <TR key={`h-${cat}`}>
                        <TD className="bg-subtle font-semibold" colSpan={6}>
                          {catLabel.get(cat)}
                        </TD>
                        <TD align="right" className="bg-subtle font-semibold">
                          {money(list.reduce((s, i) => s + toNumber(i.amount), 0))}
                        </TD>
                        {editable ? <TD className="bg-subtle" /> : null}
                      </TR>,
                      ...list.map((i) => (
                        <TR key={i.id}>
                          <TD className="font-mono text-[12px] text-muted">{i.item_code ?? "—"}</TD>
                          <TD>{i.description}</TD>
                          <TD className="font-mono text-[12px] text-muted">
                            {i.unit_id ? unitCode.get(i.unit_id) : "—"}
                          </TD>
                          <TD align="right" className="num">
                            {toNumber(i.quantity).toLocaleString()}
                          </TD>
                          <TD className="text-muted">{i.uom}</TD>
                          <TD align="right">{money(i.rate)}</TD>
                          <TD align="right">{money(i.amount)}</TD>
                          {editable ? (
                            <TD>
                              <div className="flex gap-1">
                                <Sheet
                                  title={p.addItem}
                                  triggerLabel={t.common.edit}
                                  triggerIcon={null}
                                  triggerVariant="ghost"
                                  triggerSize="xs"
                                >
                                  {itemForm(i)}
                                </Sheet>
                                <form action={removeBoqItem}>
                                  <Hidden values={{ ...ctx, item_id: i.id }} />
                                  <SubmitButton size="xs" variant="ghost" aria-label={p.remove}>
                                    <Trash2 />
                                  </SubmitButton>
                                </form>
                              </div>
                            </TD>
                          ) : null}
                        </TR>
                      )),
                    ];
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<Wallet />} title={p.noItems} />
            )}
          </Panel>
        ) : (
          <EmptyState icon={<Wallet />} title={p.noBudget} />
        )}
      </div>
    );
  }

  async function Requests() {
    const { data: list } = await supabase
      .from("purchase_requests")
      .select(
        "id,pr_no,title,status,cost_category_id,unit_id,needed_by,estimated_amount,created_at",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    return (
      <Panel
        title={p.views.requests}
        actions={
          <Sheet title={p.newPr} triggerLabel={p.newPr} triggerSize="xs" width="lg">
            <form action={createRequest} className="space-y-3">
              <Hidden values={ctx} />
              <Field label={p.title} required>
                <Input name="title" required />
              </Field>
              <FormGrid cols={3}>
                <Field label={p.costCode} required>
                  {categorySelect()}
                </Field>
                <Field label={p.unit}>{unitSelect()}</Field>
                <Field label={p.neededBy}>
                  <Input name="needed_by" type="date" />
                </Field>
              </FormGrid>
              <p className="text-2xs font-medium text-muted">{p.items}</p>
              {[0, 1, 2, 3, 4].map((n) => (
                <div key={n} className="grid grid-cols-[1fr_5rem_5rem_7rem] gap-2">
                  <Input name="item_description" placeholder={p.description} required={n === 0} />
                  <Input
                    name="item_quantity"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={p.quantity}
                    defaultValue="1"
                  />
                  <Input name="item_uom" placeholder={p.uom} defaultValue="EA" />
                  <Input name="item_rate" type="number" min="0" step="any" placeholder={p.rate} />
                </div>
              ))}
              <SheetFooter>
                <SubmitButton>{p.newPr}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {list?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{p.prNo}</TH>
                <TH>{p.title}</TH>
                <TH>{p.costCode}</TH>
                <TH>{p.unit}</TH>
                <TH>{p.neededBy}</TH>
                <TH align="right">{p.estimated}</TH>
                <TH>{t.common.status}</TH>
              </tr>
            </THead>
            <tbody>
              {list.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`${base}/requests/${r.id}`}
                      className="font-mono text-[12px] font-semibold hover:text-brand hover:underline"
                    >
                      {r.pr_no}
                    </Link>
                  </TD>
                  <TD>{r.title}</TD>
                  <TD className="text-muted">{catLabel.get(r.cost_category_id)}</TD>
                  <TD className="font-mono text-[12px] text-muted">
                    {r.unit_id ? unitCode.get(r.unit_id) : "—"}
                  </TD>
                  <TD className="text-muted">{formatDate(locale, r.needed_by)}</TD>
                  <TD align="right">{money(r.estimated_amount)}</TD>
                  <TD>
                    <Badge tone={prTone[r.status] ?? "neutral"}>
                      {label(t.status.pr, r.status)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<ShoppingCart />} title={p.noRequests} />
        )}
      </Panel>
    );
  }

  async function Orders() {
    const [{ data: list }, { data: receipts }] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select(
          "id,po_no,partner_id,amount,status,needs_owner,delivery_due,cost_category_id,unit_id,decision_note,purchase_requests(pr_no)",
        )
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("goods_receipts").select("po_id,amount,inspection").eq("project_id", id),
    ]);
    const receivedOf = (po: string) =>
      (receipts ?? [])
        .filter((g) => g.po_id === po && g.inspection !== "REJECTED")
        .reduce((s, g) => s + toNumber(g.amount), 0);
    return (
      <Panel title={p.views.orders}>
        {list?.length ? (
          <ul className="divide-y divide-line">
            {list.map((o) => {
              const pr = Array.isArray(o.purchase_requests)
                ? o.purchase_requests[0]
                : o.purchase_requests;
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-mono text-[12px] font-semibold">{o.po_no}</span> ·{" "}
                      {partnerName.get(o.partner_id)}
                      {o.needs_owner ? (
                        <Badge tone="accent" className="ml-2">
                          {p.needsOwner}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-2xs text-muted">
                      {catLabel.get(o.cost_category_id)}
                      {o.unit_id ? ` · ${unitCode.get(o.unit_id)}` : ""}
                      {pr ? ` · ${pr.pr_no}` : ""} · {p.deliveryDue}{" "}
                      {formatDate(locale, o.delivery_due)} · {p.received} {money(receivedOf(o.id))}
                      {o.decision_note ? ` · ${o.decision_note}` : ""}
                    </p>
                  </div>
                  <span className="font-medium num">{money(o.amount)}</span>
                  <Badge tone={poTone[o.status] ?? "neutral"}>{label(t.status.po, o.status)}</Badge>
                  {o.status === "PENDING_APPROVAL" ? (
                    <form action={decideOrder} className="flex items-center gap-1">
                      <Hidden values={{ ...ctx, po_id: o.id }} />
                      <Input name="note" placeholder={p.reason} className="h-6 w-28 text-2xs" />
                      <SubmitButton size="xs" variant="success" name="decision" value="approve">
                        {p.approve}
                      </SubmitButton>
                      <SubmitButton size="xs" variant="danger" name="decision" value="reject">
                        {p.reject}
                      </SubmitButton>
                    </form>
                  ) : null}
                  {o.status === "APPROVED" || o.status === "PARTIALLY_RECEIVED" ? (
                    <Sheet
                      title={`${p.receive} · ${o.po_no}`}
                      triggerLabel={p.receive}
                      triggerIcon={<Receipt />}
                      triggerVariant="secondary"
                      triggerSize="xs"
                    >
                      <form action={receiveOrder} className="space-y-3">
                        <Hidden values={{ ...ctx, po_id: o.id }} />
                        <FormGrid cols={3}>
                          <Field label={p.amount} required>
                            <Input
                              name="amount"
                              type="number"
                              min="0.01"
                              step="any"
                              required
                              defaultValue={
                                Math.max(toNumber(o.amount) - receivedOf(o.id), 0) || ""
                              }
                            />
                          </Field>
                          <Field label={p.inspection}>
                            <Select name="inspection" defaultValue="ACCEPTED">
                              {Object.entries(t.status.grInspection).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={p.receivedOn}>
                            <Input name="received_on" type="date" defaultValue={today} />
                          </Field>
                        </FormGrid>
                        <Field label={p.note}>
                          <Textarea name="note" />
                        </Field>
                        <SheetFooter>
                          <SubmitButton>{p.receive}</SubmitButton>
                        </SheetFooter>
                      </form>
                    </Sheet>
                  ) : null}
                  {(o.status === "PENDING_APPROVAL" || o.status === "APPROVED") &&
                  !receivedOf(o.id) ? (
                    <form action={cancelOrder} className="flex items-center gap-1">
                      <Hidden values={{ ...ctx, po_id: o.id }} />
                      <Input
                        name="reason"
                        required
                        placeholder={p.reason}
                        className="h-6 w-24 text-2xs"
                      />
                      <SubmitButton size="xs" variant="ghost">
                        {p.cancel}
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<ShoppingCart />} title={p.noOrders} />
        )}
      </Panel>
    );
  }

  async function Claims() {
    const { data: list } = await supabase
      .from("progress_claims")
      .select(
        "id,claim_no,partner_id,period_end,claimed_amount,certified_amount,status,note,certification_note,cost_category_id",
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    return (
      <Panel
        title={p.views.claims}
        actions={
          <Sheet title={p.newClaim} triggerLabel={p.newClaim} triggerSize="xs">
            <form action={submitClaim} className="space-y-3">
              <Hidden values={ctx} />
              <FormGrid>
                <Field label={p.partner} required>
                  <Select name="partner_id" required>
                    {(partners ?? []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={p.costCode}>{categorySelect()}</Field>
              </FormGrid>
              <FormGrid>
                <Field label={p.claimed} required>
                  <Input name="claimed_amount" type="number" min="1" step="any" required />
                </Field>
                <Field label={p.periodEnd}>
                  <Input name="period_end" type="date" defaultValue={today} />
                </Field>
              </FormGrid>
              <Field label={p.note}>
                <Textarea name="note" />
              </Field>
              <SheetFooter>
                <SubmitButton>{p.newClaim}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      >
        {list?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{p.claimNo}</TH>
                <TH>{p.partner}</TH>
                <TH>{p.periodEnd}</TH>
                <TH align="right">{p.claimed}</TH>
                <TH align="right">{p.certifiedAmount}</TH>
                <TH>{t.common.status}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {list.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono text-[12px] font-semibold">{c.claim_no}</TD>
                  <TD>
                    {partnerName.get(c.partner_id)}
                    {c.note ? <p className="text-[10px] text-muted">{c.note}</p> : null}
                  </TD>
                  <TD className="text-muted">{formatDate(locale, c.period_end)}</TD>
                  <TD align="right">{money(c.claimed_amount)}</TD>
                  <TD align="right">
                    {c.certified_amount != null ? money(c.certified_amount) : "—"}
                    {c.certification_note ? (
                      <p className="text-[10px] text-muted">{c.certification_note}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <Badge tone={claimTone[c.status] ?? "neutral"}>
                      {label(t.status.claim, c.status)}
                    </Badge>
                  </TD>
                  <TD>
                    {c.status === "SUBMITTED" ? (
                      <form action={certifyClaim} className="flex items-center gap-1">
                        <Hidden values={{ ...ctx, claim_id: c.id }} />
                        <Input
                          name="certified"
                          type="number"
                          min="0"
                          step="any"
                          defaultValue={c.claimed_amount}
                          className="h-6 w-28 text-2xs"
                        />
                        <Input name="note" placeholder={p.note} className="h-6 w-28 text-2xs" />
                        <SubmitButton size="xs" variant="success">
                          {p.certify}
                        </SubmitButton>
                      </form>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Receipt />} title={p.noClaims} />
        )}
      </Panel>
    );
  }
}
