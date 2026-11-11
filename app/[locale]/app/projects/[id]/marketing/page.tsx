import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Megaphone,
  Palette,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { resolveLocale, type Dictionary, type Locale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";
import { toneOf } from "@/lib/status";
import {
  assetCategories,
  assetLanguages,
  campaignDays,
  colorsText,
  costPer,
  fileKind,
  formatBytes,
  goalShare,
  leadTagKey,
  summarizeLeads,
  type BrandColor,
  type LeadStatRow,
} from "@/lib/marketing";
import { Panel } from "@/components/ui/panel";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { MarketingUploadForm } from "@/components/domain/marketing-upload-form";
import {
  addAssetVersion,
  createAsset,
  deleteAsset,
  saveCampaign,
  savePlan,
  setAssetStatus,
  updateAsset,
} from "./actions";
import { assetTone, campaignTone, CampaignForm } from "./parts";

export const metadata: Metadata = { title: "Marketing" };

type View = "overview" | "plan" | "assets" | "campaigns";
const views: View[] = ["overview", "plan", "assets", "campaigns"];

type FileRow = {
  id: string;
  asset_id: string;
  version_no: number;
  path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  created_at: string;
};

/**
 * Project marketing: overview (budget, leads, campaign results), the marketing plan, the brand
 * kit (logo, CI, brochures, ad creatives with versions and approval) and the campaign list.
 */
export default async function ProjectMarketing({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ view?: string; category?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const q = await searchParams;
  const view: View = views.find((v) => v === q.view) ?? "overview";
  const { supabase } = await getStaffSession(locale);
  const m = t.marketing;
  const base = `/${locale}/app/projects/${id}/marketing`;
  const back = `${base}?view=${view}${q.category ? `&category=${q.category}` : ""}`;

  const { data: project } = await supabase
    .from("projects")
    .select("id,organization_id,code,name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const [
    { data: canView },
    { data: canEdit },
    { data: canApprove },
    { data: plan },
    { data: assets },
    { data: files },
    { data: campaigns },
    { data: leadRows },
  ] = await Promise.all([
    supabase.rpc("can_view_marketing", { target_project: id }),
    supabase.rpc("can_market", { target_project: id, target_action: "EDIT" }),
    supabase.rpc("can_market", { target_project: id, target_action: "APPROVE" }),
    supabase.from("marketing_plans").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("marketing_assets")
      .select("id,category,title,description,language,tags,status,approved_at,updated_at")
      .eq("project_id", id)
      .order("category")
      .order("title"),
    supabase
      .from("marketing_asset_files")
      .select("id,asset_id,version_no,path,file_name,mime_type,size_bytes,note,created_at")
      .eq("project_id", id)
      .order("version_no", { ascending: false }),
    supabase
      .from("marketing_campaigns")
      .select(
        "id,code,name,objective,status,start_date,end_date,budget,channels,lead_tag,goal_leads,goal_bookings",
      )
      .eq("project_id", id)
      .order("start_date", { ascending: false, nullsFirst: true }),
    supabase.rpc("marketing_lead_stats", { target_project: id }),
  ]);

  if (!canView) {
    return (
      <Panel>
        <EmptyState icon={<Megaphone />} title={t.flash.permission} />
      </Panel>
    );
  }

  const fileRows = (files ?? []) as FileRow[];
  const versionsOf = new Map<string, FileRow[]>();
  for (const f of fileRows) versionsOf.set(f.asset_id, [...(versionsOf.get(f.asset_id) ?? []), f]);
  const latest = (assetId: string) => versionsOf.get(assetId)?.[0];

  // Signed links for every file: inline preview and forced download.
  const paths = fileRows.map((f) => f.path);
  const [preview, download] = paths.length
    ? await Promise.all([
        supabase.storage.from("marketing-files").createSignedUrls(paths, 3600),
        supabase.storage.from("marketing-files").createSignedUrls(paths, 3600, { download: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const previewUrl = new Map(
    (preview.data ?? []).map((u) => [u.path ?? "", u.signedUrl ?? undefined]),
  );
  const downloadUrl = new Map(
    (download.data ?? []).map((u) => [u.path ?? "", u.signedUrl ?? undefined]),
  );

  const leads = summarizeLeads((leadRows ?? []) as LeadStatRow[]);
  const colors = ((plan?.brand_colors ?? []) as BrandColor[]).filter((c) => c?.hex);
  const logo = (assets ?? []).find(
    (a) =>
      a.category === "LOGO" &&
      a.status !== "ARCHIVED" &&
      fileKind(latest(a.id)?.mime_type, latest(a.id)?.file_name) === "image",
  );
  const campaignBudget = (campaigns ?? [])
    .filter((c) => c.status !== "CANCELLED")
    .reduce((s, c) => s + (Number(c.budget) || 0), 0);
  const spendBase = Number(plan?.budget_total) || campaignBudget;

  return (
    <div className="space-y-4">
      <Tabs
        active={view}
        items={views.map((v) => ({
          key: v,
          label: m.views[v],
          href: `${base}?view=${v}`,
          count:
            v === "assets"
              ? (assets?.length ?? 0)
              : v === "campaigns"
                ? (campaigns?.length ?? 0)
                : undefined,
        }))}
      />
      {!canEdit ? (
        <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{m.readOnly}</p>
      ) : null}

      {view === "overview" ? (
        <>
          <KpiStrip cols={6}>
            <Kpi
              label={m.kpi.budget}
              value={plan?.budget_total ? formatMoneyCompact(locale, plan.budget_total) : "—"}
              sub={`${m.kpi.campaignBudget} ${formatMoneyCompact(locale, campaignBudget)}`}
            />
            <Kpi
              label={m.kpi.activeCampaigns}
              value={formatNumber(
                locale,
                (campaigns ?? []).filter((c) => c.status === "ACTIVE").length,
              )}
              sub={`${formatNumber(locale, campaigns?.length ?? 0)} ${m.views.campaigns}`}
              href={`${base}?view=campaigns`}
            />
            <Kpi
              label={m.kpi.leads}
              value={formatNumber(locale, leads.total.leads)}
              sub={goalText(locale, m, leads.total.leads, plan?.goal_leads)}
              tone="brand"
            />
            <Kpi
              label={m.kpi.booked}
              value={formatNumber(locale, leads.total.booked)}
              sub={goalText(locale, m, leads.total.booked, plan?.goal_bookings)}
              tone={leads.total.booked ? "positive" : "default"}
            />
            <Kpi
              label={m.kpi.cpl}
              value={money(locale, costPer(spendBase, leads.total.leads))}
              sub={m.kpi.planned}
            />
            <Kpi
              label={m.kpi.cpb}
              value={money(locale, costPer(spendBase, leads.total.booked))}
              sub={`${m.kpi.approvedFiles} ${formatNumber(locale, (assets ?? []).filter((a) => a.status === "APPROVED").length)}`}
            />
          </KpiStrip>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={m.overview.brand} className="lg:col-span-1">
              {plan ? (
                <div className="space-y-3 p-4 text-[13px]">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl.get(latest(logo.id)!.path)}
                      alt={m.overview.logo}
                      className="max-h-20 max-w-full object-contain"
                    />
                  ) : null}
                  {plan.tagline ? <p className="text-base font-semibold">{plan.tagline}</p> : null}
                  {colors.length ? <Swatches colors={colors} /> : null}
                  {plan.key_message ? <p className="text-ink-2">{plan.key_message}</p> : null}
                  {plan.target_audience ? (
                    <p className="text-2xs text-muted">
                      <span className="font-medium text-ink-2">
                        {m.plan.fields.target_audience}:{" "}
                      </span>
                      {plan.target_audience}
                    </p>
                  ) : null}
                  {plan.brand_tone ? (
                    <p className="text-2xs text-muted">
                      <span className="font-medium text-ink-2">{m.plan.fields.brand_tone}: </span>
                      {plan.brand_tone}
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  icon={<Palette />}
                  title={m.overview.noPlan}
                  body={m.overview.noPlanBody}
                  action={
                    canEdit ? (
                      <Link
                        href={`${base}?view=plan`}
                        className="text-[13px] font-medium text-brand"
                      >
                        {m.overview.startPlan} →
                      </Link>
                    ) : null
                  }
                />
              )}
            </Panel>

            <Panel title={m.overview.byCampaign} className="lg:col-span-2">
              {campaigns?.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>{m.campaigns.fields.name}</TH>
                      <TH>{m.campaigns.fields.status}</TH>
                      <TH align="right">{m.campaigns.fields.budget}</TH>
                      <TH align="right">{m.campaigns.fields.results}</TH>
                      <TH align="right">{m.kpi.cpl}</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {campaigns.map((c) => {
                      const r = leads.byTag.get(leadTagKey(c.lead_tag ?? c.code) ?? "");
                      return (
                        <TR key={c.id}>
                          <TD>
                            <Link
                              href={`${base}/campaigns/${c.id}`}
                              className="font-medium text-brand"
                            >
                              {c.name}
                            </Link>
                            <span className="ml-1 font-mono text-2xs text-muted">{c.code}</span>
                          </TD>
                          <TD>
                            <Badge tone={campaignTone[c.status]}>
                              {label(m.campaigns.status, c.status)}
                            </Badge>
                          </TD>
                          <TD align="right">
                            {c.budget != null ? formatMoneyCompact(locale, c.budget) : "—"}
                          </TD>
                          <TD align="right">
                            {formatNumber(locale, r?.leads ?? 0)} /{" "}
                            {formatNumber(locale, r?.booked ?? 0)}
                          </TD>
                          <TD align="right">
                            {money(locale, costPer(Number(c.budget), r?.leads ?? 0))}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              ) : (
                <EmptyState
                  icon={<Megaphone />}
                  title={m.campaigns.empty}
                  body={m.campaigns.emptyBody}
                />
              )}
            </Panel>
          </div>

          <Panel title={m.overview.bySource}>
            {leads.total.leads ? (
              <Table>
                <THead>
                  <TR>
                    <TH>{t.sales.fields.source}</TH>
                    <TH align="right">{m.kpi.leads}</TH>
                    <TH align="right">{t.status.leadStage.QUALIFIED}+</TH>
                    <TH align="right">{m.kpi.booked}</TH>
                    <TH align="right">%</TH>
                  </TR>
                </THead>
                <tbody>
                  {[...leads.bySource.entries()]
                    .sort((a, b) => b[1].leads - a[1].leads)
                    .map(([source, r]) => (
                      <TR key={source}>
                        <TD>{label(t.status.leadSource, source)}</TD>
                        <TD align="right">{formatNumber(locale, r.leads)}</TD>
                        <TD align="right">{formatNumber(locale, r.qualified)}</TD>
                        <TD align="right">{formatNumber(locale, r.booked)}</TD>
                        <TD align="right">
                          {r.leads
                            ? `${formatNumber(locale, (r.booked / r.leads) * 100, 1)}%`
                            : "—"}
                        </TD>
                      </TR>
                    ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title={m.overview.noLeads} />
            )}
          </Panel>
        </>
      ) : null}

      {view === "plan" ? (
        <Panel
          title={m.views.plan}
          description={plan?.updated_at ? formatDate(locale, plan.updated_at) : undefined}
        >
          {canEdit ? (
            <form action={savePlan} className="space-y-6 p-4">
              <Hidden values={{ locale, return_to: back, project_id: id }} />
              <PlanSection title={m.plan.sections.brand}>
                <FormGrid>
                  <Field label={m.plan.fields.tagline}>
                    <Input name="tagline" defaultValue={plan?.tagline ?? ""} />
                  </Field>
                  <Field label={m.plan.fields.website_url}>
                    <Input
                      name="website_url"
                      type="url"
                      defaultValue={plan?.website_url ?? ""}
                      placeholder="https://"
                    />
                  </Field>
                </FormGrid>
                <Field label={m.plan.fields.location_text}>
                  <Input name="location_text" defaultValue={plan?.location_text ?? ""} />
                </Field>
                <FormGrid>
                  <Field label={m.plan.fields.brand_colors} hint={m.plan.hints.brand_colors}>
                    <Textarea
                      name="brand_colors"
                      defaultValue={colorsText(colors)}
                      placeholder={"Primary #1F3A5F\nGold #C9A86A\nSand #F4EFE6"}
                      className="font-mono"
                    />
                  </Field>
                  <div className="space-y-3">
                    <Field label={m.plan.fields.brand_fonts}>
                      <Input
                        name="brand_fonts"
                        defaultValue={plan?.brand_fonts ?? ""}
                        placeholder="Playfair Display / Sarabun"
                      />
                    </Field>
                    <Field label={m.plan.fields.brand_tone} hint={m.plan.hints.brand_tone}>
                      <Input name="brand_tone" defaultValue={plan?.brand_tone ?? ""} />
                    </Field>
                  </div>
                </FormGrid>
                {colors.length ? <Swatches colors={colors} /> : null}
              </PlanSection>

              <PlanSection title={m.plan.sections.audience}>
                <Field label={m.plan.fields.target_audience} hint={m.plan.hints.target_audience}>
                  <Textarea name="target_audience" defaultValue={plan?.target_audience ?? ""} />
                </Field>
                <Field label={m.plan.fields.personas} hint={m.plan.hints.personas}>
                  <Textarea name="personas" rows={5} defaultValue={plan?.personas ?? ""} />
                </Field>
                <FormGrid>
                  <Field label={m.plan.fields.usp} hint={m.plan.hints.usp}>
                    <Textarea name="usp" rows={5} defaultValue={plan?.usp ?? ""} />
                  </Field>
                  <Field label={m.plan.fields.competitors}>
                    <Textarea name="competitors" rows={5} defaultValue={plan?.competitors ?? ""} />
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label={m.plan.fields.key_message}>
                    <Textarea name="key_message" defaultValue={plan?.key_message ?? ""} />
                  </Field>
                  <Field label={m.plan.fields.positioning}>
                    <Textarea name="positioning" defaultValue={plan?.positioning ?? ""} />
                  </Field>
                </FormGrid>
              </PlanSection>

              <PlanSection title={m.plan.sections.goals}>
                <FormGrid cols={3}>
                  <Field label={m.plan.fields.budget_total}>
                    <Input
                      name="budget_total"
                      inputMode="decimal"
                      defaultValue={plan?.budget_total ?? ""}
                    />
                  </Field>
                  <Field label={m.plan.fields.start_date}>
                    <Input name="start_date" type="date" defaultValue={plan?.start_date ?? ""} />
                  </Field>
                  <Field label={m.plan.fields.end_date}>
                    <Input name="end_date" type="date" defaultValue={plan?.end_date ?? ""} />
                  </Field>
                  <Field label={m.plan.fields.goal_leads}>
                    <Input
                      name="goal_leads"
                      inputMode="numeric"
                      defaultValue={plan?.goal_leads ?? ""}
                    />
                  </Field>
                  <Field label={m.plan.fields.goal_bookings}>
                    <Input
                      name="goal_bookings"
                      inputMode="numeric"
                      defaultValue={plan?.goal_bookings ?? ""}
                    />
                  </Field>
                  <Field label={m.plan.fields.goal_sales_value}>
                    <Input
                      name="goal_sales_value"
                      inputMode="decimal"
                      defaultValue={plan?.goal_sales_value ?? ""}
                    />
                  </Field>
                </FormGrid>
                <Field label={m.plan.fields.notes}>
                  <Textarea name="notes" defaultValue={plan?.notes ?? ""} />
                </Field>
              </PlanSection>
              <div className="flex justify-end">
                <SubmitButton>{t.common.save}</SubmitButton>
              </div>
            </form>
          ) : (
            <PlanReadOnly t={t} locale={locale} plan={plan} />
          )}
        </Panel>
      ) : null}

      {view === "assets" ? (
        <Panel
          title={m.views.assets}
          actions={
            canEdit ? (
              <Sheet
                title={m.assets.upload}
                triggerLabel={m.assets.upload}
                triggerIcon={<Upload />}
                triggerSize="xs"
              >
                <MarketingUploadForm
                  action={createAsset}
                  hidden={{ locale, return_to: back, project_id: id }}
                  folder={`${project.organization_id}/${id}`}
                  labels={{
                    file: m.assets.file,
                    submit: t.common.save,
                    uploadFailed: m.assets.uploadFailed,
                    tooLarge: m.assets.tooLarge,
                    hint: m.assets.fileHint,
                  }}
                >
                  <AssetFields t={t} defaults={{ category: q.category }} />
                </MarketingUploadForm>
              </Sheet>
            ) : null
          }
        >
          <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
            {[null, ...assetCategories].map((c) => {
              const n = (assets ?? []).filter((a) => !c || a.category === c).length;
              if (c && !n) return null;
              const on = (q.category ?? null) === c;
              return (
                <Link
                  key={c ?? "all"}
                  href={`${base}?view=assets${c ? `&category=${c}` : ""}`}
                  className={`rounded-full px-2.5 py-1 text-2xs font-medium ${on ? "bg-brand text-white" : "bg-subtle text-ink-2 hover:text-ink"}`}
                >
                  {c ? label(m.assets.category, c) : m.assets.allCategories} · {n}
                </Link>
              );
            })}
          </div>
          {(() => {
            const shown = (assets ?? []).filter((a) => !q.category || a.category === q.category);
            if (!shown.length)
              return (
                <EmptyState
                  icon={<FolderOpen />}
                  title={m.assets.empty}
                  body={m.assets.emptyBody}
                />
              );
            return (
              <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {shown.map((a) => {
                  const f = latest(a.id);
                  const kind = fileKind(f?.mime_type, f?.file_name);
                  const versions = versionsOf.get(a.id) ?? [];
                  return (
                    <li
                      key={a.id}
                      className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface"
                    >
                      <a
                        href={f ? previewUrl.get(f.path) : undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="grid aspect-[4/3] place-items-center overflow-hidden bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
                      >
                        {f && kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewUrl.get(f.path)}
                            alt={a.title}
                            className="size-full object-contain p-2"
                          />
                        ) : kind === "video" ? (
                          <Film className="size-10 text-faint" />
                        ) : (
                          <FileText className="size-10 text-faint" />
                        )}
                      </a>
                      <div className="flex flex-1 flex-col gap-1 border-t border-line p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-[13px] font-medium">{a.title}</p>
                          <Badge tone={assetTone[a.status]}>
                            {label(m.assets.status, a.status)}
                          </Badge>
                        </div>
                        <p className="text-2xs text-muted">
                          {label(m.assets.category, a.category)}
                          {a.language ? ` · ${label(m.language, a.language)}` : ""}
                          {f ? ` · ${m.assets.version.replace("{n}", String(f.version_no))}` : ""}
                          {f?.size_bytes ? ` · ${formatBytes(f.size_bytes)}` : ""}
                        </p>
                        {a.tags?.length ? (
                          <p className="truncate text-2xs text-faint">#{a.tags.join(" #")}</p>
                        ) : null}
                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                          {f ? (
                            <a
                              href={downloadUrl.get(f.path)}
                              className="inline-flex items-center gap-1 text-2xs font-medium text-brand"
                            >
                              <Download className="size-3.5" />
                              {m.assets.download}
                            </a>
                          ) : null}
                          <Sheet
                            title={a.title}
                            description={m.assets.details}
                            triggerLabel={m.assets.details}
                            triggerIcon={<Pencil />}
                            triggerVariant="ghost"
                            triggerSize="xs"
                            width="lg"
                          >
                            <AssetDetail
                              t={t}
                              locale={locale}
                              asset={a}
                              versions={versions}
                              previewUrl={previewUrl}
                              downloadUrl={downloadUrl}
                              canEdit={Boolean(canEdit)}
                              canApprove={Boolean(canApprove)}
                              hidden={{ locale, return_to: back, project_id: id, asset_id: a.id }}
                              folder={`${project.organization_id}/${id}`}
                            />
                          </Sheet>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </Panel>
      ) : null}

      {view === "campaigns" ? (
        <Panel
          title={m.views.campaigns}
          actions={
            canEdit ? (
              <Sheet
                title={m.campaigns.new}
                triggerLabel={m.campaigns.new}
                triggerSize="xs"
                width="lg"
              >
                <CampaignForm
                  t={t}
                  action={saveCampaign}
                  hidden={{ locale, return_to: back, project_id: id }}
                />
              </Sheet>
            ) : null
          }
        >
          {campaigns?.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>{m.campaigns.fields.name}</TH>
                  <TH>{m.campaigns.fields.objective}</TH>
                  <TH>{m.campaigns.fields.period}</TH>
                  <TH>{m.campaigns.fields.channels}</TH>
                  <TH align="right">{m.campaigns.fields.budget}</TH>
                  <TH align="right">{m.campaigns.fields.results}</TH>
                  <TH>{m.campaigns.fields.status}</TH>
                </TR>
              </THead>
              <tbody>
                {campaigns.map((c) => {
                  const r = leads.byTag.get(leadTagKey(c.lead_tag ?? c.code) ?? "");
                  const days = campaignDays(c.start_date, c.end_date);
                  return (
                    <TR key={c.id}>
                      <TD>
                        <Link href={`${base}/campaigns/${c.id}`} className="font-medium text-brand">
                          {c.name}
                        </Link>
                        <div className="font-mono text-2xs text-muted">{c.code}</div>
                      </TD>
                      <TD>{label(m.campaigns.objective, c.objective)}</TD>
                      <TD>
                        {formatDate(locale, c.start_date)} – {formatDate(locale, c.end_date)}
                        {days ? (
                          <div className="text-2xs text-muted">
                            {m.campaigns.days.replace("{n}", String(days))}
                          </div>
                        ) : null}
                      </TD>
                      <TD className="max-w-56">
                        <span className="line-clamp-2 text-2xs">
                          {(c.channels ?? [])
                            .map((ch: string) => label(m.channel, ch))
                            .join(", ") || "—"}
                        </span>
                      </TD>
                      <TD align="right">
                        {c.budget != null ? formatMoney(locale, c.budget) : "—"}
                      </TD>
                      <TD align="right">
                        {formatNumber(locale, r?.leads ?? 0)}
                        {c.goal_leads ? (
                          <span className="text-muted">/{formatNumber(locale, c.goal_leads)}</span>
                        ) : null}
                        {" · "}
                        {formatNumber(locale, r?.booked ?? 0)}
                        {c.goal_bookings ? (
                          <span className="text-muted">
                            /{formatNumber(locale, c.goal_bookings)}
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <Badge tone={campaignTone[c.status] ?? toneOf(c.status)}>
                          {label(m.campaigns.status, c.status)}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={<Megaphone />}
              title={m.campaigns.empty}
              body={m.campaigns.emptyBody}
            />
          )}
        </Panel>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

const money = (locale: Locale, v: number | null) =>
  v == null ? "—" : formatMoney(locale, Math.round(v));

function goalText(
  locale: Locale,
  m: Dictionary["marketing"],
  actual: number,
  goal: number | null | undefined,
) {
  const share = goalShare(actual, goal);
  return share == null
    ? ""
    : `${formatNumber(locale, share * 100)}% ${m.kpi.ofGoal} ${formatNumber(locale, goal)}`;
}

function Swatches({ colors }: { colors: BrandColor[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-md border border-line py-1 pr-2 pl-1"
        >
          <span className="size-6 rounded ring-1 ring-black/10" style={{ background: c.hex }} />
          <span className="text-2xs">
            {c.name ? <span className="font-medium">{c.name} </span> : null}
            <span className="font-mono text-muted">{c.hex}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function PlanSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-2xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function PlanReadOnly({
  t,
  locale,
  plan,
}: {
  t: Dictionary;
  locale: Locale;
  plan: Record<string, unknown> | null;
}) {
  const f = t.marketing.plan.fields;
  const text = (k: keyof typeof f) => {
    const v = plan?.[k];
    if (v == null || v === "") return <span className="text-faint">{t.marketing.plan.empty}</span>;
    if (k === "budget_total" || k === "goal_sales_value") return formatMoney(locale, v);
    if (k === "start_date" || k === "end_date") return formatDate(locale, String(v));
    return <span className="whitespace-pre-line">{String(v)}</span>;
  };
  const keys = (Object.keys(f) as (keyof typeof f)[]).filter((k) => k !== "brand_colors");
  return (
    <dl className="divide-y divide-line">
      {keys.map((k) => (
        <div key={k} className="grid grid-cols-[minmax(140px,30%)_1fr] gap-3 px-4 py-2 text-[13px]">
          <dt className="text-muted">{f[k]}</dt>
          <dd>{text(k)}</dd>
        </div>
      ))}
    </dl>
  );
}

function AssetFields({
  t,
  defaults,
}: {
  t: Dictionary;
  defaults: {
    category?: string;
    title?: string;
    description?: string | null;
    language?: string | null;
    tags?: string[];
  };
}) {
  const a = t.marketing.assets;
  return (
    <>
      <FormGrid>
        <Field label={a.fields.category} required>
          <Select name="category" defaultValue={defaults.category ?? "LOGO"}>
            {assetCategories.map((c) => (
              <option key={c} value={c}>
                {a.category[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={a.fields.language}>
          <Select name="language" defaultValue={defaults.language ?? ""}>
            <option value="">—</option>
            {assetLanguages.map((l) => (
              <option key={l} value={l}>
                {t.marketing.language[l]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={a.fields.title} required>
        <Input name="title" required defaultValue={defaults.title ?? ""} />
      </Field>
      <Field label={a.fields.description}>
        <Textarea name="description" defaultValue={defaults.description ?? ""} />
      </Field>
      <Field label={a.fields.tags} hint={a.tagsHint}>
        <Input name="tags" defaultValue={(defaults.tags ?? []).join(", ")} />
      </Field>
    </>
  );
}

function AssetDetail({
  t,
  locale,
  asset,
  versions,
  previewUrl,
  downloadUrl,
  canEdit,
  canApprove,
  hidden,
  folder,
}: {
  t: Dictionary;
  locale: Locale;
  asset: {
    id: string;
    category: string;
    title: string;
    description: string | null;
    language: string | null;
    tags: string[] | null;
    status: string;
    approved_at: string | null;
  };
  versions: FileRow[];
  previewUrl: Map<string, string | undefined>;
  downloadUrl: Map<string, string | undefined>;
  canEdit: boolean;
  canApprove: boolean;
  hidden: Record<string, string>;
  folder: string;
}) {
  const a = t.marketing.assets;
  const locked = asset.status === "APPROVED" && !canApprove;
  const nextStatuses = (["REVIEW", "APPROVED", "DRAFT", "ARCHIVED"] as const).filter(
    (s) => s !== asset.status && (s !== "APPROVED" || canApprove),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={assetTone[asset.status]}>{label(a.status, asset.status)}</Badge>
        {asset.approved_at ? (
          <span className="text-2xs text-muted">
            {a.approvedBy.replace("{date}", formatDate(locale, asset.approved_at))}
          </span>
        ) : null}
      </div>
      {asset.description ? (
        <p className="text-[13px] whitespace-pre-line text-ink-2">{asset.description}</p>
      ) : null}

      {canEdit && !locked ? (
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((s) => (
            <form key={s} action={setAssetStatus}>
              <Hidden values={{ ...hidden, status: s }} />
              <SubmitButton variant={s === "APPROVED" ? "primary" : "secondary"} size="xs">
                {a.actions[s]}
              </SubmitButton>
            </form>
          ))}
        </div>
      ) : null}

      <section>
        <h3 className="mb-2 text-2xs font-semibold tracking-wide text-muted uppercase">
          {a.versions}
        </h3>
        <ul className="divide-y divide-line rounded-md border border-line">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="font-mono text-2xs font-semibold">
                {a.version.replace("{n}", String(v.version_no))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{v.file_name ?? v.path.split("/").pop()}</p>
                <p className="text-2xs text-muted">
                  {formatDate(locale, v.created_at)}
                  {v.size_bytes ? ` · ${formatBytes(v.size_bytes)}` : ""}
                  {v.note ? ` · ${v.note}` : ""}
                </p>
              </div>
              <a
                href={previewUrl.get(v.path)}
                target="_blank"
                rel="noreferrer"
                className="text-brand"
                title={a.preview}
              >
                <ExternalLink className="size-4" />
              </a>
              <a href={downloadUrl.get(v.path)} className="text-brand" title={a.download}>
                <Download className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {canEdit && !locked ? (
        <>
          <section className="rounded-md border border-line p-3">
            <h3 className="mb-2 text-[13px] font-semibold">{a.newVersion}</h3>
            <p className="mb-2 text-2xs text-muted">{a.newVersionHint}</p>
            <MarketingUploadForm
              action={addAssetVersion}
              hidden={hidden}
              folder={folder}
              labels={{
                file: a.file,
                submit: a.newVersion,
                uploadFailed: a.uploadFailed,
                tooLarge: a.tooLarge,
                hint: a.fileHint,
              }}
            >
              <Field label={a.versionNote}>
                <Input name="note" />
              </Field>
            </MarketingUploadForm>
          </section>
          <section className="rounded-md border border-line p-3">
            <h3 className="mb-2 text-[13px] font-semibold">{a.edit}</h3>
            <form action={updateAsset} className="space-y-3">
              <Hidden values={hidden} />
              <AssetFields
                t={t}
                defaults={{
                  category: asset.category,
                  title: asset.title,
                  description: asset.description,
                  language: asset.language,
                  tags: asset.tags ?? [],
                }}
              />
              <SheetFooter>
                <SubmitButton>{t.common.save}</SubmitButton>
              </SheetFooter>
            </form>
          </section>
          <form
            action={deleteAsset}
            className="flex items-center justify-between gap-2 rounded-md border border-red-200 p-3"
          >
            <Hidden values={hidden} />
            <span className="text-2xs text-red-700">{a.deleteConfirm}</span>
            <SubmitButton variant="danger" size="xs">
              <Trash2 />
              {a.delete}
            </SubmitButton>
          </form>
        </>
      ) : null}
    </div>
  );
}
