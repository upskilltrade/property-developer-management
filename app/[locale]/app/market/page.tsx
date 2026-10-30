import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  Landmark,
  MapPinned,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale, type Dictionary, type Locale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime, formatMoneyCompact, formatNumber } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import {
  competitorGrades,
  competitorPrice,
  competitorStatuses,
  defaultAssumptions,
  gradeTone,
  landPriceKinds,
  marketByZone,
  offeringOptions,
  opportunityTone,
  productTypes,
  readAssumptions,
  zoneOf,
  type Assumptions,
  type Competitor,
  type LandPrice,
  type Zone,
  type ZoneStats,
} from "@/lib/market";
import type { MarketAnalysis } from "@/lib/market-ai";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { Tabs } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { MarketMap, type MapPoint, type MapZone } from "@/components/domain/market-map";
import {
  deleteMarketRow,
  researchZone,
  runMarketAnalysis,
  saveCompetitor,
  saveLandPrice,
  saveZone,
  verifyMarketRow,
} from "./actions";

export const metadata: Metadata = { title: "Land & market" };
// AI research searches the web and can take a few minutes.
export const maxDuration = 300;

const views = ["overview", "competitors", "land", "analysis"] as const;
type View = (typeof views)[number];
/** Hua Hin town centre, where the map opens before any zone exists. */
const HUA_HIN = { lat: 12.5684, lng: 99.9577 };

type AnalysisRow = {
  id: string;
  result: MarketAnalysis & { assumptions?: Assumptions };
  created_at: string;
};

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, t } = await resolveLocale(params);
  const q = await searchParams;
  const { supabase, isInternal } = await getSession(locale);
  if (!isInternal) redirect(`/${locale}/app/access-denied`);
  const m = t.market;
  const view: View = (views as readonly string[]).includes(q.view ?? "")
    ? (q.view as View)
    : "overview";
  const a = readAssumptions(q);
  const base = `/${locale}/app/market`;
  const assumptionQs = Object.fromEntries(
    (Object.keys(defaultAssumptions) as (keyof Assumptions)[])
      .filter((k) => a[k] !== defaultAssumptions[k])
      .map((k) => [k, String(a[k])]),
  );
  const href = (v: View) => `${base}?${new URLSearchParams({ view: v, ...assumptionQs })}`;
  const back = href(view);
  const hidden = { locale, return_to: back };

  const [{ data: zoneRows }, { data: landRows }, { data: compRows }, { data: analysisRows }] =
    await Promise.all([
      supabase.from("market_zones").select("*").order("name"),
      supabase.from("land_prices").select("*").order("created_at", { ascending: false }),
      supabase.from("competitor_projects").select("*").order("name"),
      supabase
        .from("market_analyses")
        .select("id,result,created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
  const zones = (zoneRows ?? []) as Zone[];
  const lands = (landRows ?? []) as LandPrice[];
  const comps = (compRows ?? []) as Competitor[];
  const { zones: stats, outside } = marketByZone(zones, lands, comps, a);
  const latest = (analysisRows?.[0] ?? null) as AnalysisRow | null;
  const ai = aiConfigured();
  const zoneName = (lat: number | null, lng: number | null) =>
    zoneOf(lat, lng, zones)?.name ?? m.outside;
  const wah = (v: number | null) => (v == null ? "—" : formatNumber(locale, v));
  const money = (v: number | null) => (v == null ? "—" : formatMoneyCompact(locale, v));
  const unverified = <Badge tone="warning">{m.unverified}</Badge>;

  const mapZones: MapZone[] = stats.map((s) => ({
    id: s.zone!.id,
    name: s.zone!.name,
    lat: s.zone!.center_lat,
    lng: s.zone!.center_lng,
    radius: s.zone!.radius_m,
    tone: s.opportunity,
    label: `${m.opportunities[s.opportunity]} · ${m.landMedian} ${wah(s.landMedian)} · ${m.target} ${wah(s.targetPerWah)}`,
  }));
  const mapPoints: MapPoint[] = [
    ...lands
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        id: l.id,
        kind: "land" as const,
        lat: l.lat!,
        lng: l.lng!,
        title: `${formatNumber(locale, l.price_per_wah)} ${m.perWah}`,
        detail: [
          label(m.kinds, l.kind),
          l.location_text,
          l.area_wah ? `${wah(l.area_wah)} ${m.wah}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        verified: l.verified,
      })),
    ...comps
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => {
        const p = competitorPrice(c);
        return {
          id: c.id,
          kind: "competitor" as const,
          lat: c.lat!,
          lng: c.lng!,
          title: c.name,
          detail: [
            c.grade ? `${m.grade} ${c.grade}` : "",
            money(p.price),
            p.perSqm ? `${formatNumber(locale, p.perSqm)} ${m.perSqm}` : "",
            label(m.statuses, c.status),
          ]
            .filter(Boolean)
            .join(" · "),
          grade: c.grade,
          verified: c.verified,
        };
      }),
  ];

  const deleteButton = (table: string, id: string) => (
    <form action={deleteMarketRow}>
      <Hidden values={{ ...hidden, table, id }} />
      <SubmitButton size="xs" variant="ghost" aria-label={m.delete}>
        <Trash2 />
      </SubmitButton>
    </form>
  );
  const verifyButton = (table: string, id: string) => (
    <form action={verifyMarketRow}>
      <Hidden values={{ ...hidden, table, id }} />
      <SubmitButton size="xs" variant="success">
        <CheckCircle2 />
        {m.verify}
      </SubmitButton>
    </form>
  );
  const sourceLink = (url: string | null) =>
    url ? (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-brand hover:underline"
      >
        <ExternalLink className="size-3.5" />
        {m.source}
      </a>
    ) : null;
  const coord = (lat: number | null, lng: number | null) =>
    lat != null && lng != null ? `${lat}, ${lng}` : "";

  const zoneForm = (z?: Zone) => (
    <form action={saveZone} className="space-y-3">
      <Hidden values={{ ...hidden, id: z?.id ?? "" }} />
      <Field label={m.zoneName} required>
        <Input name="name" required defaultValue={z?.name} placeholder={m.zoneNamePlaceholder} />
      </Field>
      <FormGrid>
        <Field label={m.coordinate} required hint={m.coordinateHint}>
          <Input
            name="coordinate"
            required
            defaultValue={z ? coord(z.center_lat, z.center_lng) : ""}
            placeholder="12.5684, 99.9577"
          />
        </Field>
        <Field label={m.radiusKm}>
          <Input
            name="radius_km"
            type="number"
            step="0.1"
            min="0.1"
            defaultValue={z ? z.radius_m / 1000 : 2}
          />
        </Field>
      </FormGrid>
      <Field label={m.notes}>
        <Textarea name="notes" defaultValue={z?.notes ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{z ? m.save : m.addZone}</SubmitButton>
      </SheetFooter>
    </form>
  );

  const landForm = (l?: LandPrice) => (
    <form action={saveLandPrice} className="space-y-3">
      <Hidden values={{ ...hidden, id: l?.id ?? "" }} />
      <FormGrid>
        <Field label={m.coordinate} hint={m.coordinateHint}>
          <Input
            name="coordinate"
            defaultValue={l ? coord(l.lat, l.lng) : ""}
            placeholder="12.5684, 99.9577"
          />
        </Field>
        <Field label={m.kind}>
          <Select name="kind" defaultValue={l?.kind ?? "ASKING"}>
            {landPriceKinds.map((k) => (
              <option key={k} value={k}>
                {m.kinds[k]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={`${m.price} (${m.perWah})`} hint={m.priceEither}>
          <Input
            name="price_per_wah"
            type="number"
            step="any"
            defaultValue={l?.price_per_wah ?? ""}
          />
        </Field>
        <Field label={`${m.price} (${m.perRai})`}>
          <Input name="price_per_rai" type="number" step="any" />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={`${m.area} (${m.wah})`}>
          <Input name="area_wah" type="number" step="any" defaultValue={l?.area_wah ?? ""} />
        </Field>
        <Field label={m.observedOn}>
          <Input name="observed_on" type="date" defaultValue={l?.observed_on ?? ""} />
        </Field>
      </FormGrid>
      <Field label={m.locationText}>
        <Input name="location_text" defaultValue={l?.location_text ?? ""} />
      </Field>
      <Field label={m.sourceUrl}>
        <Input name="source_url" type="url" defaultValue={l?.source_url ?? ""} />
      </Field>
      <Field label={m.notes}>
        <Textarea name="notes" defaultValue={l?.notes ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{l ? m.save : m.addLand}</SubmitButton>
      </SheetFooter>
    </form>
  );

  const compForm = (c?: Competitor) => (
    <form action={saveCompetitor} className="space-y-3">
      <Hidden values={{ ...hidden, id: c?.id ?? "" }} />
      <FormGrid>
        <Field label={m.projectName} required>
          <Input name="name" required defaultValue={c?.name} />
        </Field>
        <Field label={m.developer}>
          <Input name="developer" defaultValue={c?.developer ?? ""} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={m.coordinate} hint={m.coordinateHint}>
          <Input
            name="coordinate"
            defaultValue={c ? coord(c.lat, c.lng) : ""}
            placeholder="12.5684, 99.9577"
          />
        </Field>
        <Field label={m.locationText}>
          <Input name="location_text" defaultValue={c?.location_text ?? ""} />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label={m.productType}>
          <Select name="product_type" defaultValue={c?.product_type ?? "POOL_VILLA"}>
            {productTypes.map((p) => (
              <option key={p} value={p}>
                {m.productTypes[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={m.status}>
          <Select name="status" defaultValue={c?.status ?? "SELLING"}>
            {competitorStatuses.map((s) => (
              <option key={s} value={s}>
                {m.statuses[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={m.grade} hint={m.gradeHint}>
          <Select name="grade" defaultValue={c?.grade ?? ""}>
            <option value="">—</option>
            {competitorGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={m.priceMinM}>
          <Input
            name="price_min"
            type="number"
            step="any"
            defaultValue={c?.price_min ? c.price_min / 1_000_000 : ""}
          />
        </Field>
        <Field label={m.priceMaxM}>
          <Input
            name="price_max"
            type="number"
            step="any"
            defaultValue={c?.price_max ? c.price_max / 1_000_000 : ""}
          />
        </Field>
        <Field label={m.houseMin}>
          <Input
            name="house_area_min"
            type="number"
            step="any"
            defaultValue={c?.house_area_min ?? ""}
          />
        </Field>
        <Field label={m.houseMax}>
          <Input
            name="house_area_max"
            type="number"
            step="any"
            defaultValue={c?.house_area_max ?? ""}
          />
        </Field>
        <Field label={m.landMin}>
          <Input
            name="land_area_min_wah"
            type="number"
            step="any"
            defaultValue={c?.land_area_min_wah ?? ""}
          />
        </Field>
        <Field label={m.landMax}>
          <Input
            name="land_area_max_wah"
            type="number"
            step="any"
            defaultValue={c?.land_area_max_wah ?? ""}
          />
        </Field>
        <Field label={m.bedrooms}>
          <Input name="bedrooms" defaultValue={c?.bedrooms ?? ""} placeholder="3-4" />
        </Field>
        <Field label={m.units}>
          <Input name="units_total" type="number" defaultValue={c?.units_total ?? ""} />
        </Field>
      </FormGrid>
      <fieldset>
        <legend className="mb-1 text-2xs font-medium text-ink-2">{m.offerings}</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
          {offeringOptions.map((o) => (
            <label key={o} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="offerings"
                value={o}
                defaultChecked={c?.offerings?.includes(o)}
              />
              {m.offeringLabels[o]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={m.strengths}>
        <Textarea name="strengths" defaultValue={c?.strengths ?? ""} />
      </Field>
      <Field label={m.weaknesses}>
        <Textarea name="weaknesses" defaultValue={c?.weaknesses ?? ""} />
      </Field>
      <FormGrid>
        <Field label={m.sourceUrl}>
          <Input name="source_url" type="url" defaultValue={c?.source_url ?? ""} />
        </Field>
        <Field label={m.observedOn}>
          <Input name="observed_on" type="date" defaultValue={c?.observed_on ?? ""} />
        </Field>
      </FormGrid>
      <Field label={m.notes}>
        <Textarea name="notes" defaultValue={c?.notes ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{c ? m.save : m.addCompetitor}</SubmitButton>
      </SheetFooter>
    </form>
  );

  let body: React.ReactNode;
  if (view === "overview") {
    const best = stats.find((s) => s.opportunity === "GOOD");
    body = (
      <div className="space-y-4">
        <KpiStrip cols={4}>
          <Kpi label={m.kpiZones} value={formatNumber(locale, zones.length)} icon={<MapPinned />} />
          <Kpi label={m.kpiLand} value={formatNumber(locale, lands.length)} icon={<Landmark />} />
          <Kpi label={m.kpiCompetitors} value={formatNumber(locale, comps.length)} />
          <Kpi
            label={m.kpiBest}
            value={best?.zone?.name ?? "—"}
            sub={best ? `${m.target} ${wah(best.targetPerWah)} ${m.perWah}` : m.kpiBestNone}
            tone={best ? "positive" : "default"}
          />
        </KpiStrip>
        <Panel title={m.mapTitle} description={m.mapHint}>
          <MarketMap
            zones={mapZones}
            points={mapPoints}
            center={zones[0] ? { lat: zones[0].center_lat, lng: zones[0].center_lng } : HUA_HIN}
            labels={{
              street: m.street,
              satellite: m.satellite,
              coordinate: m.coordinate,
              copy: m.copy,
              unverified: m.unverified,
            }}
          />
        </Panel>
        <ZoneTable
          stats={stats}
          outside={outside}
          locale={locale}
          t={t}
          hidden={hidden}
          ai={ai}
          zoneForm={zoneForm}
          deleteButton={deleteButton}
        />
        <AssumptionsForm a={a} m={m} base={base} view={view} />
      </div>
    );
  } else if (view === "competitors") {
    body = (
      <Panel title={m.views.competitors} description={m.competitorsHint}>
        {comps.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{m.projectName}</TH>
                <TH>{m.zone}</TH>
                <TH>{m.grade}</TH>
                <TH align="right">{m.price}</TH>
                <TH align="right">{m.perSqm}</TH>
                <TH>{m.offerings}</TH>
                <TH>{m.strengthsWeaknesses}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {comps.map((c) => {
                const p = competitorPrice(c);
                return (
                  <TR key={c.id}>
                    <TD>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-2xs text-muted">
                        {[
                          c.developer,
                          label(m.productTypes, c.product_type),
                          label(m.statuses, c.status),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-2xs">
                        {c.verified ? null : unverified}
                        {sourceLink(c.source_url)}
                      </div>
                    </TD>
                    <TD className="text-2xs">{zoneName(c.lat, c.lng)}</TD>
                    <TD>
                      {c.grade ? (
                        <Badge tone={gradeTone[c.grade as keyof typeof gradeTone] ?? "neutral"}>
                          {c.grade}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD align="right" className="num whitespace-nowrap">
                      {c.price_min || c.price_max
                        ? `${money(c.price_min)}${c.price_max && c.price_max !== c.price_min ? `–${money(c.price_max)}` : ""}`
                        : "—"}
                      <div className="text-2xs text-muted">
                        {c.house_area_min
                          ? `${wah(c.house_area_min)}${c.house_area_max && c.house_area_max !== c.house_area_min ? `–${wah(c.house_area_max)}` : ""} ${m.sqm}`
                          : ""}
                      </div>
                    </TD>
                    <TD align="right" className="num">
                      {p.perSqm ? formatNumber(locale, p.perSqm) : "—"}
                    </TD>
                    <TD className="max-w-56 text-2xs">
                      {c.offerings.map((o) => label(m.offeringLabels, o)).join(", ") || "—"}
                    </TD>
                    <TD className="max-w-72 text-2xs whitespace-normal">
                      {c.strengths ? (
                        <p>
                          <span className="font-medium text-emerald-700">+ </span>
                          {c.strengths}
                        </p>
                      ) : null}
                      {c.weaknesses ? (
                        <p>
                          <span className="font-medium text-red-700">− </span>
                          {c.weaknesses}
                        </p>
                      ) : null}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        {c.verified ? null : verifyButton("competitor", c.id)}
                        <Sheet
                          title={`${m.edit} · ${c.name}`}
                          triggerLabel={m.edit}
                          triggerIcon={<Pencil />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                          width="lg"
                        >
                          {compForm(c)}
                        </Sheet>
                        {deleteButton("competitor", c.id)}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={m.emptyCompetitors} body={m.emptyCompetitorsBody} />
        )}
      </Panel>
    );
  } else if (view === "land") {
    body = (
      <Panel title={m.views.land} description={m.landHint}>
        {lands.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{m.locationText}</TH>
                <TH>{m.zone}</TH>
                <TH>{m.kind}</TH>
                <TH align="right">{m.perWah}</TH>
                <TH align="right">{m.perRai}</TH>
                <TH align="right">{m.area}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {lands.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <div>{l.location_text || coord(l.lat, l.lng) || "—"}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-2xs">
                      {l.verified ? null : unverified}
                      {sourceLink(l.source_url)}
                      {l.notes ? <span className="text-muted">{l.notes}</span> : null}
                    </div>
                  </TD>
                  <TD className="text-2xs">{zoneName(l.lat, l.lng)}</TD>
                  <TD>{label(m.kinds, l.kind)}</TD>
                  <TD align="right" className="num font-medium">
                    {formatNumber(locale, l.price_per_wah)}
                  </TD>
                  <TD align="right" className="num text-muted">
                    {money(Number(l.price_per_wah) * 400)}
                  </TD>
                  <TD align="right" className="num">
                    {l.area_wah ? `${wah(l.area_wah)} ${m.wah}` : "—"}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      {l.verified ? null : verifyButton("land", l.id)}
                      <Sheet
                        title={m.edit}
                        triggerLabel={m.edit}
                        triggerIcon={<Pencil />}
                        triggerVariant="ghost"
                        triggerSize="xs"
                      >
                        {landForm(l)}
                      </Sheet>
                      {deleteButton("land", l.id)}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={m.emptyLand} body={m.emptyLandBody} />
        )}
      </Panel>
    );
  } else {
    body = (
      <AnalysisView
        latest={latest}
        m={m}
        locale={locale}
        ai={ai}
        hidden={{ ...hidden, ...assumptionQs }}
        canRun={zones.length > 0}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Sheet
              title={m.addZone}
              triggerLabel={m.addZone}
              triggerIcon={<MapPinned />}
              triggerVariant="secondary"
            >
              {zoneForm()}
            </Sheet>
            <Sheet
              title={m.addLand}
              triggerLabel={m.addLand}
              triggerIcon={<Plus />}
              triggerVariant="secondary"
            >
              {landForm()}
            </Sheet>
            <Sheet
              title={m.addCompetitor}
              triggerLabel={m.addCompetitor}
              triggerIcon={<Plus />}
              width="lg"
            >
              {compForm()}
            </Sheet>
          </div>
        }
      />
      <div className="mb-4">
        <Tabs
          active={view}
          items={views.map((v) => ({
            key: v,
            label: m.views[v],
            href: href(v),
            count: v === "competitors" ? comps.length : v === "land" ? lands.length : undefined,
          }))}
        />
      </div>
      {body}
    </>
  );
}

function ZoneTable({
  stats,
  outside,
  locale,
  t,
  hidden,
  ai,
  zoneForm,
  deleteButton,
}: {
  stats: ZoneStats[];
  outside: ZoneStats;
  locale: Locale;
  t: Dictionary;
  hidden: Record<string, string>;
  ai: boolean;
  zoneForm: (z: Zone) => React.ReactNode;
  deleteButton: (table: string, id: string) => React.ReactNode;
}) {
  const m = t.market;
  const wah = (v: number | null) => (v == null ? "—" : formatNumber(locale, v));
  const rows = outside.lands.length || outside.competitors.length ? [...stats, outside] : stats;
  return (
    <Panel title={m.zoneTitle} description={m.zoneHint}>
      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <TH>{m.zone}</TH>
              <TH>{m.opportunity}</TH>
              <TH align="right">{m.landMedian}</TH>
              <TH align="right">{m.appraisal}</TH>
              <TH align="right">{m.compPerSqm}</TH>
              <TH align="right">{m.residual}</TH>
              <TH align="right">{m.target}</TH>
              <TH align="right">{m.competitorCount}</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => (
              <TR key={s.zone?.id ?? "outside"}>
                <TD>
                  <div className="font-medium">{s.zone?.name ?? m.outside}</div>
                  <div className="text-2xs text-muted">
                    {s.lands.length} {m.landPoints}
                    {s.zone ? ` · ${formatNumber(locale, s.zone.radius_m / 1000, 1)} km` : ""}
                  </div>
                </TD>
                <TD>
                  <Badge tone={opportunityTone[s.opportunity]}>
                    {m.opportunities[s.opportunity]}
                  </Badge>
                  {s.headroomPct != null ? (
                    <div className="mt-0.5 text-2xs text-muted num">
                      {m.headroom} {s.headroomPct >= 0 ? "+" : ""}
                      {formatNumber(locale, s.headroomPct)}%
                    </div>
                  ) : null}
                </TD>
                <TD align="right" className="num">
                  {wah(s.landMedian)}
                  {s.soldMedian != null ? (
                    <div className="text-2xs text-muted">
                      {m.kinds.SOLD} {wah(s.soldMedian)}
                    </div>
                  ) : null}
                </TD>
                <TD align="right" className="num text-muted">
                  {wah(s.appraisalMedian)}
                </TD>
                <TD align="right" className="num">
                  {wah(s.compPerSqmMedian)}
                </TD>
                <TD align="right" className="num">
                  {wah(s.residualPerWah)}
                </TD>
                <TD align="right" className="num font-semibold text-brand">
                  {wah(s.targetPerWah)}
                </TD>
                <TD align="right" className="num">
                  {s.competitors.length}
                  <div className="text-2xs text-muted">
                    {Object.entries(s.grades)
                      .sort()
                      .map(([g, n]) => `${g}:${n}`)
                      .join(" ")}
                  </div>
                </TD>
                <TD>
                  {s.zone ? (
                    <div className="flex items-center justify-end gap-1">
                      {ai ? (
                        <form action={researchZone}>
                          <Hidden values={{ ...hidden, id: s.zone.id }} />
                          <SubmitButton size="xs" variant="secondary" title={m.researchHint}>
                            <Search />
                            {m.research}
                          </SubmitButton>
                        </form>
                      ) : null}
                      <Sheet
                        title={`${m.edit} · ${s.zone.name}`}
                        triggerLabel={m.edit}
                        triggerIcon={<Pencil />}
                        triggerVariant="ghost"
                        triggerSize="xs"
                      >
                        {zoneForm(s.zone)}
                      </Sheet>
                      {deleteButton("zone", s.zone.id)}
                    </div>
                  ) : null}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<MapPinned />} title={m.emptyZones} body={m.emptyZonesBody} />
      )}
      <p className="border-t border-line px-4 py-2 text-2xs text-muted">{m.zoneFootnote}</p>
    </Panel>
  );
}

function AssumptionsForm({
  a,
  m,
  base,
  view,
}: {
  a: Assumptions;
  m: Dictionary["market"];
  base: string;
  view: string;
}) {
  const fields: { key: keyof Assumptions; step: string }[] = [
    { key: "houseSqm", step: "1" },
    { key: "plotWah", step: "1" },
    { key: "buildPerSqm", step: "100" },
    { key: "infraPerPlot", step: "1000" },
    { key: "sellingPct", step: "0.5" },
    { key: "priceToCost", step: "0.01" },
    { key: "negotiationPct", step: "1" },
  ];
  return (
    <Panel title={m.assumptionsTitle} description={m.assumptionsHint}>
      <form action={base} method="get" className="space-y-3 p-4">
        <input type="hidden" name="view" value={view} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {fields.map((f) => (
            <Field key={f.key} label={m.assumptions[f.key]}>
              <Input name={f.key} type="number" step={f.step} defaultValue={a[f.key]} />
            </Field>
          ))}
        </div>
        <div className="flex gap-2">
          <SubmitButton size="xs">{m.recalculate}</SubmitButton>
          <a href={base} className="text-2xs text-muted hover:underline self-center">
            {m.resetAssumptions}
          </a>
        </div>
      </form>
    </Panel>
  );
}

const verdictTone = {
  PLAY: "success",
  WATCH: "warning",
  AVOID: "danger",
  NEED_DATA: "neutral",
} as const;
const threatTone = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" } as const;

function AnalysisView({
  latest,
  m,
  locale,
  ai,
  hidden,
  canRun,
}: {
  latest: AnalysisRow | null;
  m: Dictionary["market"];
  locale: Locale;
  ai: boolean;
  hidden: Record<string, string>;
  canRun: boolean;
}) {
  const r = latest?.result;
  const list = (title: string, items: string[] | undefined) =>
    items?.length ? (
      <Panel title={title}>
        <ul className="list-disc space-y-1 py-3 pr-4 pl-8 text-[13px]">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </Panel>
    ) : null;
  return (
    <div className="space-y-4">
      <Panel
        title={m.analysisTitle}
        description={
          latest ? `${m.analysisAt} ${formatDateTime(locale, latest.created_at)}` : m.analysisHint
        }
        actions={
          ai && canRun ? (
            <form action={runMarketAnalysis}>
              <Hidden values={hidden} />
              <SubmitButton size="xs">
                <Sparkles />
                {latest ? m.analyzeAgain : m.analyze}
              </SubmitButton>
            </form>
          ) : null
        }
      >
        {r ? (
          <p className="px-4 py-3 text-[13px] leading-relaxed">{r.summary_th}</p>
        ) : (
          <EmptyState
            icon={<Sparkles />}
            title={!ai ? m.aiOff : canRun ? m.analysisEmpty : m.emptyZones}
          />
        )}
      </Panel>
      {r?.zones?.length ? (
        <Panel title={m.analysisZones}>
          <ul className="divide-y divide-line">
            {r.zones.map((z, i) => (
              <li key={i} className="space-y-1 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{z.zone}</span>
                  <Badge tone={verdictTone[z.verdict]}>{m.verdicts[z.verdict]}</Badge>
                </div>
                <p>{z.reason_th}</p>
                <p className="text-2xs text-ink-2">
                  <span className="font-medium">{m.whatToBuild}: </span>
                  {z.product_th}
                </p>
                <p className="text-2xs text-ink-2">
                  <span className="font-medium">{m.target}: </span>
                  {z.target_price_th}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {r?.competitors?.length ? (
        <Panel title={m.analysisCompetitors}>
          <Table>
            <THead>
              <tr>
                <TH>{m.projectName}</TH>
                <TH>{m.threat}</TH>
                <TH>{m.strengths}</TH>
                <TH>{m.weaknesses}</TH>
              </tr>
            </THead>
            <tbody>
              {r.competitors.map((c, i) => (
                <TR key={i}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD>
                    <Badge tone={threatTone[c.threat]}>{m.threats[c.threat]}</Badge>
                  </TD>
                  <TD className="text-2xs whitespace-normal">{c.strengths_th}</TD>
                  <TD className="text-2xs whitespace-normal">{c.weaknesses_th}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {list(m.gaps, r?.gaps_th)}
        {list(m.risks, r?.risks_th)}
        {list(m.nextData, r?.next_data_th)}
      </div>
    </div>
  );
}
