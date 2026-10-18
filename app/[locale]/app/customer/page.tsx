import { CalendarCheck, FileText, Home, Images, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, toNumber } from "@/lib/format";
import { scheduleStages } from "@/lib/schedule";
import { Panel } from "@/components/ui/panel";
import { Sheet } from "@/components/ui/sheet";
import { AssistantChat } from "@/components/domain/assistant-chat";
import { omiseConfigured } from "@/lib/omise";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/cn";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";
import { PhotoThumb } from "@/components/domain/photo-thumb";
import {
  CustomerPayments,
  type CustomerBankAccount,
  type CustomerUnitPayments,
} from "@/components/domain/customer-payments";
import {
  CustomerDesign,
  type CustomerDrawing,
  type CustomerSelection,
} from "@/components/domain/customer-design";
import {
  CustomerChanges,
  type CustomerOffer,
  type CustomerRequest,
} from "@/components/domain/customer-changes";
import { VO_VERSION_COLUMNS } from "@/lib/variations";
import {
  CustomerHome,
  type HomeDefect,
  type HomeService,
  type HomeWarranty,
} from "@/components/domain/customer-home";
import {
  acceptHome,
  confirmService,
  decideDesign,
  decideVariation,
  reportObservation,
  requestChange,
  requestService,
  submitPaymentEvidence,
} from "./actions";

type Named = { name_th: string; name_en: string };
type PortalUnit = {
  unit_id: string;
  unit_code: string;
  unit_name: string | null;
  project_name: string;
  progress: number | string;
  handover: string | null;
  activities: (Named & {
    code: string;
    stage: string;
    weight: number;
    is_milestone: boolean;
    percent: number;
  })[];
  updates: (Named & { id: string; date: string; percent: number; stage: string })[];
  photos: (Named & {
    id: string;
    path: string;
    thumb: string | null;
    caption: string | null;
    taken_at: string;
  })[];
};

/** Customer view: only published, verified progress and photos of the customer's own units. */
export default async function CustomerPortal({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase } = await getSession(locale);
  const c = t.portal.customer;
  const [{ data }, { data: paymentData }, { data: bankData }] = await Promise.all([
    supabase.rpc("get_customer_portal"),
    supabase.rpc("get_customer_payments"),
    supabase.rpc("get_customer_bank_accounts"),
  ]);
  const bankAccounts = (bankData ?? []) as CustomerBankAccount[];
  const paymentsByUnit = new Map(
    ((paymentData ?? []) as CustomerUnitPayments[]).map((x) => [x.unit_id, x]),
  );
  const units = (data ?? []) as PortalUnit[];

  if (!units.length) {
    return (
      <PortalPlaceholder
        icon={<Home />}
        title={c.title}
        body={c.body}
        tone="brand"
        homeHref={`/${locale}/workspace`}
        homeLabel={t.portal.goHome}
      />
    );
  }

  const paths = units.flatMap((u) =>
    u.photos.flatMap((p) => [p.path, p.thumb].filter(Boolean) as string[]),
  );
  const { data: signed } = paths.length
    ? await supabase.storage.from("site-photos").createSignedUrls(paths, 3600)
    : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  // RLS returns only this customer's signed contracts; the PDF opens through a short-lived URL.
  const { data: contracts } = await supabase
    .from("sales_contracts")
    .select("id,unit_id,contract_no,signed_on,signed_file_path")
    .eq("status", "SIGNED");
  const contractPaths = (contracts ?? [])
    .map((k) => k.signed_file_path)
    .filter(Boolean) as string[];
  const { data: contractUrls } = contractPaths.length
    ? await supabase.storage.from("contract-files").createSignedUrls(contractPaths, 600)
    : { data: [] };
  const contractUrl = new Map((contractUrls ?? []).map((x) => [x.path, x.signedUrl]));
  // Design: RLS returns only released revisions of customer-visible drawings and published selections.
  const [{ data: designRevs }, { data: designSels }, { data: designDecisions }] = await Promise.all(
    [
      supabase
        .from("drawing_revisions")
        .select(
          "id,revision_code,released_at,file_path,drawings!drawing_revisions_drawing_id_fkey(drawing_no,title,discipline)",
        )
        .eq("status", "RELEASED"),
      supabase
        .from("material_selections")
        .select("id,unit_id,area,version,status,materials(name_th,name_en,brand,image_path)")
        .in("status", ["PUBLISHED", "APPROVED", "CHANGE_REQUESTED"])
        .order("area"),
      supabase
        .from("customer_approvals")
        .select("entity_id,decision,comment,decided_at")
        .order("decided_at", { ascending: false }),
    ],
  );
  const pick = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
  const designPaths = [
    ...(designRevs ?? []).map((r) => r.file_path),
    ...(designSels ?? []).map((x) => pick(x.materials)?.image_path).filter(Boolean),
  ] as string[];
  const { data: designUrls } = designPaths.length
    ? await supabase.storage.from("design-files").createSignedUrls(designPaths, 600)
    : { data: [] };
  const designUrl = new Map((designUrls ?? []).map((x) => [x.path, x.signedUrl]));
  const unitCodeById = new Map(units.map((u) => [u.unit_id, u.unit_code]));
  // Change control: own requests and the variation versions offered to this customer.
  const [{ data: crRows }, { data: voRows }, { data: voVersions }] = await Promise.all([
    supabase
      .from("change_requests")
      .select("id,cr_no,title,status,unit_id,created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("variation_orders")
      .select("id,vo_no,title,status,unit_id,current_version,approved_version")
      .order("created_at", { ascending: false }),
    supabase.from("vo_versions").select(VO_VERSION_COLUMNS),
  ]);
  const customerRequests: CustomerRequest[] = (crRows ?? []).map((r) => ({
    id: r.id,
    crNo: r.cr_no,
    title: r.title,
    status: r.status,
    unitCode: unitCodeById.get(r.unit_id) ?? "",
    createdAt: r.created_at,
  }));
  // Handover / homeowner mode per unit.
  const [{ data: handovers }, { data: warrantyRows }, { data: serviceRows }, { data: defectRows }] =
    await Promise.all([
      supabase
        .from("unit_handovers")
        .select(
          "unit_id,status,inspection_scheduled_at,handover_date,acknowledgement_path,handover_items(id,kind,description,file_path)",
        ),
      supabase
        .from("unit_warranties")
        .select("id,unit_id,end_date,warranty_types(name_th,name_en)"),
      supabase
        .from("service_requests")
        .select("id,unit_id,sr_no,title,status,resolution,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("defects")
        .select("id,unit_id,defect_no,title,location,status")
        .order("created_at", { ascending: false }),
    ]);
  const handoverPaths = (handovers ?? []).flatMap((x) =>
    [x.acknowledgement_path, ...(x.handover_items ?? []).map((i) => i.file_path)].filter(Boolean),
  ) as string[];
  const { data: handoverUrls } = handoverPaths.length
    ? await supabase.storage.from("handover-files").createSignedUrls(handoverPaths, 600)
    : { data: [] };
  const handoverUrl = new Map((handoverUrls ?? []).map((x) => [x.path, x.signedUrl]));
  const todayIso = new Date().toISOString().slice(0, 10);
  const homeFor = (unitId: string) => {
    const ho = (handovers ?? []).find((x) => x.unit_id === unitId);
    if (!ho || !["CUSTOMER_INSPECTION", "ACCEPTED", "HANDED_OVER"].includes(ho.status)) return null;
    return {
      handover: {
        status: ho.status,
        inspectionAt: ho.inspection_scheduled_at,
        handoverDate: ho.handover_date,
        acknowledgementUrl: ho.acknowledgement_path
          ? (handoverUrl.get(ho.acknowledgement_path) ?? null)
          : null,
        items: (ho.handover_items ?? []).map((i) => ({
          id: i.id,
          kind: i.kind,
          description: i.description,
          url: i.file_path ? (handoverUrl.get(i.file_path) ?? null) : null,
        })),
      },
      warranties: (warrantyRows ?? [])
        .filter((w) => w.unit_id === unitId)
        .map((w): HomeWarranty => {
          const wt = pick(w.warranty_types);
          return {
            id: w.id,
            name: (locale === "en" && wt?.name_en) || wt?.name_th || "",
            endDate: w.end_date,
            active: w.end_date >= todayIso,
          };
        }),
      services: (serviceRows ?? [])
        .filter((x) => x.unit_id === unitId)
        .map(
          (x): HomeService => ({
            id: x.id,
            srNo: x.sr_no,
            title: x.title,
            status: x.status,
            resolution: x.resolution,
            createdAt: x.created_at,
          }),
        ),
      defects: (defectRows ?? [])
        .filter((d) => d.unit_id === unitId)
        .map(
          (d): HomeDefect => ({
            id: d.id,
            defectNo: d.defect_no,
            title: d.title,
            location: d.location,
            status: d.status,
          }),
        ),
    };
  };
  // RLS returns items only for the version currently offered to this buyer.
  const { data: offerItems } = await supabase
    .from("vo_items")
    .select("id,vo_version_id,seq,kind,description,quantity,unit,unit_price,amount");
  const customerOffers: CustomerOffer[] = (voRows ?? []).map((v) => {
    const ver = (voVersions ?? []).find((x) => x.vo_id === v.id && x.version === v.current_version);
    return {
      id: v.id,
      voNo: v.vo_no,
      title: v.title,
      status: v.status,
      unitCode: unitCodeById.get(v.unit_id) ?? "",
      version: v.current_version,
      revisedScope: ver?.revised_scope ?? "",
      priceDelta: Number(ver?.price_delta ?? 0),
      timeDeltaDays: ver?.time_delta_days ?? 0,
      items: ver ? (offerItems ?? []).filter((i) => i.vo_version_id === ver.id) : [],
    };
  });
  const customerDrawings: CustomerDrawing[] = (designRevs ?? []).map((r) => {
    const dr = pick(r.drawings);
    return {
      revisionId: r.id,
      drawingNo: dr?.drawing_no ?? "",
      title: dr?.title ?? "",
      discipline: dr?.discipline ?? "",
      revisionCode: r.revision_code,
      releasedAt: r.released_at,
      url: designUrl.get(r.file_path) ?? null,
    };
  });
  const customerSelections: CustomerSelection[] = (designSels ?? []).map((x) => {
    const m = pick(x.materials);
    return {
      id: x.id,
      unitCode: unitCodeById.get(x.unit_id) ?? "",
      area: x.area,
      version: x.version,
      status: x.status,
      material: (locale === "en" && m?.name_en) || m?.name_th || "",
      brand: m?.brand ?? null,
      imageUrl: m?.image_path ? (designUrl.get(m.image_path) ?? null) : null,
    };
  });
  const name = (x: Named) => (locale === "th" ? x.name_th : x.name_en) || x.name_en;
  const date = (v: string | null | undefined) => formatDate(locale, v);

  const ca = t.customerAssistant;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/20 bg-brand-soft/40 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <Sparkles className="size-4 shrink-0 text-brand" />
          {ca.banner}
        </p>
        <Sheet title={ca.title} triggerLabel={ca.open} triggerIcon={<Sparkles />} width="lg">
          <AssistantChat
            locale={locale}
            configured={Boolean(process.env.ANTHROPIC_API_KEY)}
            endpoint={`/${locale}/app/customer/assistant`}
            linkPrefixes={[`/${locale}/app/customer`, `/${locale}/receipt/`]}
            compact
            labels={{
              placeholder: ca.placeholder,
              send: ca.send,
              clear: ca.clear,
              working: ca.working,
              disclaimer: ca.disclaimer,
              examples: ca.examples,
              tools: ca.tools,
              errors: ca.errors,
              truncated: ca.truncated,
            }}
          />
        </Sheet>
      </div>
      {units.map((u) => {
        const stages = scheduleStages
          .map((stage) => {
            const acts = u.activities.filter((a) => a.stage === stage && !a.is_milestone);
            const w = acts.reduce((s, a) => s + toNumber(a.weight), 0);
            return {
              stage,
              pct: w
                ? acts.reduce((s, a) => s + toNumber(a.weight) * toNumber(a.percent), 0) / w
                : null,
            };
          })
          .filter((s) => s.pct != null);
        return (
          <section key={u.unit_id} className="space-y-4">
            {(() => {
              const home = homeFor(u.unit_id);
              return home ? (
                <CustomerHome
                  t={t}
                  locale={locale}
                  unitId={u.unit_id}
                  {...home}
                  actions={{ reportObservation, acceptHome, requestService, confirmService }}
                />
              ) : null;
            })()}
            <div className="rounded-lg border border-line bg-surface p-5 shadow-xs">
              <p className="text-2xs font-medium tracking-wide text-muted uppercase">
                {u.project_name}
              </p>
              <h1 className="text-xl font-semibold">
                {u.unit_code}
                {u.unit_name ? (
                  <span className="ml-2 text-[14px] font-normal text-muted">{u.unit_name}</span>
                ) : null}
              </h1>
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className="text-[13px] font-medium">{c.progress}</p>
                  <p className="mb-2 text-2xs text-muted">{c.progressHint}</p>
                  <div className="flex items-center gap-3">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, toNumber(u.progress))}%` }}
                      />
                    </div>
                    <span className="text-2xl font-semibold num">
                      {toNumber(u.progress).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {u.handover ? (
                  <div className="rounded-md bg-subtle px-3 py-2 text-right">
                    <p className="flex items-center justify-end gap-1 text-2xs text-muted">
                      <CalendarCheck className="size-3.5" />
                      {c.handover}
                    </p>
                    <p className="text-[15px] font-semibold">{date(u.handover)}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {(contracts ?? []).some((k) => k.unit_id === u.unit_id) ? (
              <Panel title={c.documents}>
                <ul className="divide-y divide-line">
                  {(contracts ?? [])
                    .filter((k) => k.unit_id === u.unit_id)
                    .map((k) => {
                      const href = k.signed_file_path ? contractUrl.get(k.signed_file_path) : null;
                      return (
                        <li key={k.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                          <FileText className="size-4 shrink-0 text-muted" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{c.signedContract}</p>
                            <p className="text-2xs text-muted">
                              {k.contract_no} · {date(k.signed_on)}
                            </p>
                          </div>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[13px] font-medium text-brand hover:underline"
                            >
                              {c.openDocument}
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                </ul>
              </Panel>
            ) : null}

            <CustomerPayments
              data={paymentsByUnit.get(u.unit_id)}
              onlinePay={omiseConfigured()}
              accounts={bankAccounts.filter(
                (a) => a.project_id === paymentsByUnit.get(u.unit_id)?.project_id,
              )}
              locale={locale}
              t={t}
              action={submitPaymentEvidence}
            />

            <Panel title={c.stages}>
              <ol className="divide-y divide-line">
                {stages.map((s) => (
                  <li
                    key={s.stage}
                    className="grid grid-cols-[8rem_1fr] items-center gap-3 px-4 py-2.5 text-[13px]"
                  >
                    <span className={cn("font-medium", s.pct! >= 100 && "text-emerald-700")}>
                      {label(t.status.stage, s.stage)}
                    </span>
                    <Progress value={s.pct!} />
                  </li>
                ))}
              </ol>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title={c.updates}>
                {u.updates.length ? (
                  <ul className="divide-y divide-line">
                    {u.updates.slice(0, 12).map((x) => (
                      <li
                        key={x.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{name(x)}</p>
                          <p className="text-2xs text-muted">{date(x.date)}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-semibold num",
                            toNumber(x.percent) >= 100 ? "text-emerald-700" : "text-brand",
                          )}
                        >
                          {toNumber(x.percent)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={<CalendarCheck />} title={c.noUpdates} />
                )}
              </Panel>
              <Panel title={c.photos}>
                {u.photos.length ? (
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {u.photos.slice(0, 24).map((p) => (
                      <PhotoThumb
                        key={p.id}
                        full={url.get(p.path) ?? ""}
                        thumb={url.get(p.thumb ?? p.path) ?? url.get(p.path) ?? ""}
                        caption={p.caption ?? name(p)}
                        meta={date(p.taken_at)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Images />} title={c.noPhotos} />
                )}
              </Panel>
            </div>
          </section>
        );
      })}
      <CustomerChanges
        t={t}
        locale={locale}
        units={units.map((u) => ({ id: u.unit_id, code: u.unit_code }))}
        requests={customerRequests}
        offers={customerOffers}
        requestAction={requestChange}
        decideAction={decideVariation}
      />
      {customerDrawings.length || customerSelections.length ? (
        <CustomerDesign
          t={t}
          locale={locale}
          drawings={customerDrawings}
          selections={customerSelections}
          decisions={(designDecisions ?? []).map((x) => ({
            entityId: x.entity_id,
            decision: x.decision,
            comment: x.comment,
            decidedAt: x.decided_at,
          }))}
          action={decideDesign}
        />
      ) : null}
    </div>
  );
}
