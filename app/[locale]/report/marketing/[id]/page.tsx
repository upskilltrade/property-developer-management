import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Sparkles, X } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { resolveLocale, type Dictionary, type Locale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatMoneyCompact, formatNumber } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import {
  deckPalette,
  fileKind,
  googleFontsUrl,
  normalizeShares,
  type BrandColor,
} from "@/lib/marketing";
import { readPresentation, type MarketingPresentation } from "@/lib/marketing-ai";
import { PrintButton } from "@/components/ui/print-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Hidden } from "@/components/ui/field";
import { buildPresentation } from "@/app/[locale]/app/projects/[id]/marketing/actions";

export const metadata: Metadata = { title: "Marketing plan" };
// Building the deck asks the AI to restructure the plan.
export const maxDuration = 300;

/**
 * The marketing plan as a presentation deck: one slide per topic in the brand's colours, fonts
 * and logo, printable to PDF (A4 landscape, one slide per page).
 */
export default async function MarketingDeck({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const q = await searchParams;
  const { supabase } = await getStaffSession(locale);
  const d = t.marketing.deck;
  const self = `/${locale}/report/marketing/${id}`;
  const back = `/${locale}/app/projects/${id}/marketing?view=plan`;

  const { data: project } = await supabase
    .from("projects")
    .select("id,code,name")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const [
    { data: canView },
    { data: canEdit },
    { data: plan },
    { data: assets },
    { data: campaigns },
  ] = await Promise.all([
    supabase.rpc("can_view_marketing", { target_project: id }),
    supabase.rpc("can_market", { target_project: id, target_action: "EDIT" }),
    supabase.from("marketing_plans").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("marketing_assets")
      .select(
        "id,category,status,updated_at,files:marketing_asset_files(path,version_no,file_name,mime_type)",
      )
      .eq("project_id", id)
      .in("category", ["LOGO", "RENDER", "PHOTO"])
      .neq("status", "ARCHIVED")
      .order("updated_at", { ascending: false }),
    supabase
      .from("marketing_campaigns")
      .select("id,code,name,status,audience,budget,channels,languages,goal_leads,goal_bookings")
      .eq("project_id", id)
      .neq("status", "CANCELLED")
      .order("budget", { ascending: false, nullsFirst: false }),
  ]);
  if (!canView) notFound();

  const deck = readPresentation(plan?.presentation);
  const colors = ((plan?.brand_colors ?? []) as BrandColor[]).filter((c) => c?.hex);
  const pal = deckPalette(colors);

  // Latest image of the logo and of a render or photo for the cover.
  const imageOf = (category: string) => {
    for (const a of assets ?? []) {
      if (a.category !== category) continue;
      const f = [
        ...((a.files ?? []) as {
          path: string;
          version_no: number;
          file_name: string | null;
          mime_type: string | null;
        }[]),
      ].sort((x, y) => y.version_no - x.version_no)[0];
      if (f && fileKind(f.mime_type, f.file_name) === "image") return f.path;
    }
    return null;
  };
  const logoPath = imageOf("LOGO");
  const coverPath = imageOf("RENDER") ?? imageOf("PHOTO");
  const wanted = [logoPath, coverPath].filter((p): p is string => !!p);
  const { data: signed } = wanted.length
    ? await supabase.storage.from("marketing-files").createSignedUrls(wanted, 3600)
    : { data: [] };
  const url = (p: string | null) =>
    p ? ((signed ?? []).find((s) => s.path === p)?.signedUrl ?? null) : null;
  const logo = url(logoPath);
  const cover = url(coverPath);

  const [planHeading, planBody] = (plan?.brand_fonts ?? "")
    .split(/[\/,;|\n]| and | และ /)
    .map((s: string) => s.replace(/\(.*?\)/g, "").trim());
  const headingFont = deck?.brand.heading_font || planHeading || null;
  const bodyFont = deck?.brand.body_font || planBody || null;
  const fonts = googleFontsUrl([headingFont, bodyFont, "Noto Sans Thai", "Noto Serif Thai"]);
  const fam = (name: string | null, fallback: string) =>
    name ? `"${name.replace(/[^A-Za-z0-9 ]/g, "")}", ${fallback}` : fallback;

  const stale =
    deck &&
    plan?.updated_at &&
    plan?.presentation_at &&
    Date.parse(plan.updated_at) - Date.parse(plan.presentation_at) > 60_000;
  const errorText = q.error
    ? ((t.flash as Record<string, string>)[q.error] ?? t.flash.error)
    : null;
  const canBuild = !!canEdit && aiConfigured();
  const builder = (text: string) => (
    <form action={buildPresentation} className="inline">
      <Hidden values={{ locale, project_id: id, return_to: self }} />
      <SubmitButton size="sm" variant={deck ? "secondary" : "primary"}>
        <Sparkles />
        {text}
      </SubmitButton>
    </form>
  );

  const style = {
    "--deck-dark": pal.dark,
    "--deck-accent": pal.accent,
    "--deck-on-accent": pal.onAccent,
    "--deck-light": pal.light,
    "--deck-heading": fam(headingFont, '"Noto Serif Thai", Georgia, serif'),
    "--deck-body": fam(bodyFont, '"Noto Sans Thai", system-ui, sans-serif'),
  } as React.CSSProperties;

  return (
    <div className="deck min-h-screen bg-[#e9e7e3] print:bg-white" style={style}>
      {fonts ? <link rel="stylesheet" href={fonts} /> : null}
      <style>{DECK_CSS}</style>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-black/10 bg-white/90 px-4 py-2 backdrop-blur print:hidden">
        <Link
          href={back}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2"
        >
          <ArrowLeft className="size-4" />
          {d.back}
        </Link>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
          {project.name}
          {plan?.presentation_at
            ? ` · ${d.builtAt.replace("{date}", formatDate(locale, plan.presentation_at))}`
            : ""}
        </span>
        {canBuild && deck ? builder(d.rebuild) : null}
        {deck ? <PrintButton label={d.print} /> : null}
      </div>
      {errorText || stale ? (
        <div className="mx-auto mt-3 max-w-[1120px] space-y-2 px-4 print:hidden">
          {errorText ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">{errorText}</p>
          ) : null}
          {stale ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{d.stale}</p>
          ) : null}
        </div>
      ) : null}

      {!deck ? (
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="text-lg font-semibold text-ink">{d.empty}</h1>
          <p className="mt-2 text-[13px] text-muted">
            {plan?.personas || plan?.target_audience ? d.emptyBody : d.noPlan}
          </p>
          <div className="mt-5">
            {canBuild && (plan?.personas || plan?.target_audience)
              ? builder(`${d.build} ${d.duration}`)
              : null}
          </div>
        </div>
      ) : (
        <Slides
          t={t}
          locale={locale}
          deck={deck}
          project={project}
          plan={plan}
          colors={colors}
          logo={logo}
          cover={cover}
          headingFont={headingFont}
          bodyFont={bodyFont}
          campaigns={campaigns ?? []}
        />
      )}
    </div>
  );
}

const DECK_CSS = `
.deck { font-family: var(--deck-body); color: #1d1d1f; }
.deck .slide { position: relative; width: min(1120px, calc(100% - 32px)); margin: 24px auto; aspect-ratio: 297 / 210; min-height: fit-content; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.08); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; padding: clamp(20px, 4.5vw, 56px); }
.deck .slide.dark { background: var(--deck-dark); color: #fff; }
.deck .slide.light { background: var(--deck-light); }
.deck h2, .deck .heading { font-family: var(--deck-heading); letter-spacing: -0.01em; font-variant-numeric: lining-nums; }
.deck .eyebrow { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--deck-accent); font-weight: 600; }
.deck .rule { width: 56px; height: 3px; background: var(--deck-accent); border-radius: 2px; }
.deck .card { border: 1px solid rgba(0,0,0,.08); border-radius: 10px; padding: 16px; background: #fff; }
.deck .dark .card { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.14); }
.deck .accent-bg { background: var(--deck-accent); color: var(--deck-on-accent); }
.deck .accent-text { color: var(--deck-accent); }
.deck .dark-text { color: var(--deck-dark); }
@media (max-width: 720px) { .deck .slide { aspect-ratio: auto; margin: 12px auto; } }
@media print {
  @page { size: A4 landscape; margin: 0; }
  .deck { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .deck .slide { width: 297mm; height: 210mm; aspect-ratio: auto; margin: 0; border-radius: 0; box-shadow: none; break-after: page; padding: 14mm 16mm; }
}
`;

type Plan = Record<string, unknown> | null;
type CampaignRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  audience: string | null;
  budget: number | null;
  channels: string[] | null;
  languages: string[] | null;
  goal_leads: number | null;
  goal_bookings: number | null;
};

function Slide({
  tone,
  eyebrow,
  title,
  page,
  children,
}: {
  tone?: "dark" | "light";
  eyebrow?: string;
  title?: string;
  page?: number;
  children: React.ReactNode;
}) {
  return (
    <section className={`slide ${tone ?? ""}`}>
      {title ? (
        <header className="mb-6">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="mt-1 text-[clamp(22px,3vw,34px)] leading-tight font-semibold">{title}</h2>
          <div className="rule mt-3" />
        </header>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
      {page ? (
        <footer className="mt-4 flex justify-end text-[10px] tracking-widest opacity-50">
          {String(page).padStart(2, "0")}
        </footer>
      ) : null}
    </section>
  );
}

const Bullets = ({ items, className = "" }: { items: string[]; className?: string }) =>
  items.length ? (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-snug">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--deck-accent)]" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  ) : null;

function Slides({
  t,
  locale,
  deck,
  project,
  plan,
  colors,
  logo,
  cover,
  headingFont,
  bodyFont,
  campaigns,
}: {
  t: Dictionary;
  locale: Locale;
  deck: MarketingPresentation;
  project: { code: string; name: string };
  plan: Plan;
  colors: BrandColor[];
  logo: string | null;
  cover: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  campaigns: CampaignRow[];
}) {
  const d = t.marketing.deck;
  const L = d.labels;
  const S = d.slides;
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const budget = num(plan?.budget_total);
  const kpis = [
    [L.budget, budget != null ? formatMoneyCompact(locale, budget) : null],
    [L.leads, num(plan?.goal_leads) != null ? formatNumber(locale, num(plan?.goal_leads)) : null],
    [
      L.bookings,
      num(plan?.goal_bookings) != null ? formatNumber(locale, num(plan?.goal_bookings)) : null,
    ],
    [
      L.salesValue,
      num(plan?.goal_sales_value) != null
        ? formatMoneyCompact(locale, num(plan?.goal_sales_value))
        : null,
    ],
  ].filter((k): k is [string, string] => !!k[1]);
  const mix = normalizeShares(deck.channel_mix);
  const funnel = deck.funnel.filter((f) => f.count != null && f.count > 0);
  const priorityLabel = { PRIMARY: L.primary, SECONDARY: L.secondary, NICHE: L.niche };
  let page = 1;
  const next = () => ++page;
  const period =
    plan?.start_date || plan?.end_date
      ? `${formatDate(locale, plan?.start_date as string)} – ${formatDate(locale, plan?.end_date as string)}`
      : null;

  return (
    <>
      {/* Cover */}
      <section className="slide dark !p-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-tr from-[var(--deck-dark)] via-[var(--deck-dark)]/80 to-transparent" />
        <div className="relative flex flex-1 flex-col justify-between p-[clamp(20px,4.5vw,56px)]">
          <div className="flex items-start justify-between gap-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={project.name}
                className="max-h-20 max-w-48 rounded bg-white/95 object-contain p-2"
              />
            ) : (
              <span className="eyebrow">{project.code}</span>
            )}
            <span className="text-[11px] tracking-wide opacity-70">{d.confidential}</span>
          </div>
          <div className="max-w-3xl">
            <p className="eyebrow">{d.title}</p>
            <h1 className="heading mt-3 text-[clamp(32px,5.5vw,64px)] leading-[1.05] font-semibold">
              {project.name}
            </h1>
            {plan?.tagline ? (
              <p className="heading mt-3 text-[clamp(16px,2vw,24px)] italic opacity-90">
                {String(plan.tagline)}
              </p>
            ) : null}
            <div className="rule mt-6" />
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed opacity-90">
              {deck.cover_line}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] opacity-75">
            {plan?.location_text ? <span>{String(plan.location_text)}</span> : null}
            {plan?.website_url ? <span>{String(plan.website_url)}</span> : null}
            {period ? <span>{period}</span> : null}
          </div>
        </div>
      </section>

      {/* Executive summary */}
      <Slide eyebrow={project.name} title={S.summary} page={next()}>
        <div className="grid h-full gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            <blockquote className="heading dark-text border-l-4 border-[var(--deck-accent)] pl-4 text-[clamp(18px,2.2vw,26px)] leading-snug">
              “{deck.big_idea}”
            </blockquote>
            <Bullets items={deck.executive_summary} className="[&_li]:text-[14px]" />
          </div>
          {kpis.length ? (
            <div className="grid grid-cols-2 content-start gap-3">
              {kpis.map(([k, v]) => (
                <div key={k} className="card">
                  <p className="text-[11px] tracking-wide text-black/50 uppercase">{k}</p>
                  <p className="heading dark-text mt-1 text-[clamp(20px,2.4vw,30px)] font-semibold">
                    {v}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Slide>

      {/* Segments */}
      {deck.segments.length ? (
        <Slide eyebrow={project.name} title={S.segments} page={next()} tone="light">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {deck.segments.map((s, i) => (
              <div key={i} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${s.priority === "PRIMARY" ? "accent-bg" : "bg-black/5 text-black/60"}`}
                  >
                    {priorityLabel[s.priority]}
                  </span>
                  {s.share_pct != null ? (
                    <span className="heading dark-text text-[22px] font-semibold">
                      {Math.round(s.share_pct)}%
                    </span>
                  ) : null}
                </div>
                <h3 className="heading dark-text text-[17px] font-semibold">{s.name}</h3>
                <p className="text-[13px] leading-snug text-black/70">{s.description}</p>
                {s.share_pct != null ? (
                  <div className="mt-auto h-1.5 rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-[var(--deck-accent)]"
                      style={{ width: `${Math.min(100, Math.max(0, s.share_pct))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Slide>
      ) : null}

      {/* Personas, two per slide */}
      {chunk(deck.personas, 2).map((group, gi) => (
        <Slide key={gi} eyebrow={project.name} title={S.personas} page={next()}>
          <div className="grid gap-4 md:grid-cols-2">
            {group.map((p, i) => (
              <article key={i} className="card space-y-3">
                <div className="flex items-center gap-3">
                  <span className="accent-bg heading flex size-11 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold">
                    {p.name.trim().charAt(0)}
                  </span>
                  <div>
                    <h3 className="heading dark-text text-[17px] font-semibold">{p.name}</h3>
                    <p className="text-[12px] text-black/55">
                      {[p.age, p.origin].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="heading rounded-md bg-[var(--deck-light)] px-3 py-2 text-[13px] italic">
                  “{p.quote}”
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="eyebrow mb-1">{L.motivations}</p>
                    <Bullets items={p.motivations} />
                  </div>
                  <div>
                    <p className="eyebrow mb-1">{L.worries}</p>
                    <Bullets items={p.worries} />
                  </div>
                  <div>
                    <p className="eyebrow mb-1">{L.howTheyBuy}</p>
                    <Bullets items={p.how_they_buy} />
                  </div>
                  <div>
                    <p className="eyebrow mb-1">{L.reach}</p>
                    <div className="flex flex-wrap gap-1">
                      {p.channels.map((c, j) => (
                        <span key={j} className="rounded bg-black/5 px-1.5 py-0.5 text-[11px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Slide>
      ))}

      {/* Positioning and value proposition */}
      <Slide eyebrow={project.name} title={S.positioning} page={next()} tone="dark">
        <p className="heading max-w-4xl text-[clamp(18px,2.3vw,28px)] leading-snug">
          {deck.positioning.statement}
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {deck.positioning.pillars.map((p, i) => (
            <div key={i} className="card">
              <p className="accent-text heading text-[26px] font-semibold">0{i + 1}</p>
              <h3 className="mt-1 text-[15px] font-semibold">{p.title}</h3>
              <p className="mt-1 text-[13px] leading-snug opacity-80">{p.text}</p>
            </div>
          ))}
        </div>
      </Slide>

      {deck.value_props.length ? (
        <Slide eyebrow={project.name} title={S.value} page={next()}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {deck.value_props.map((g, i) => (
              <div key={i} className="border-t-2 border-[var(--deck-accent)] pt-3">
                <h3 className="heading dark-text mb-2 text-[16px] font-semibold">{g.title}</h3>
                <Bullets items={g.items} />
              </div>
            ))}
          </div>
        </Slide>
      ) : null}

      {/* Brand */}
      <Slide eyebrow={project.name} title={S.brand} page={next()} tone="light">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-5">
            {colors.length ? (
              <div>
                <p className="eyebrow mb-2">{L.colors}</p>
                <div className="flex flex-wrap gap-3">
                  {colors.map((c) => (
                    <div key={c.hex + c.name} className="w-24">
                      <div
                        className="h-16 rounded-md border border-black/10"
                        style={{ background: c.hex }}
                      />
                      <p className="mt-1 text-[12px] font-medium">{c.name || "—"}</p>
                      <p className="font-mono text-[11px] text-black/50 uppercase">{c.hex}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {headingFont || bodyFont ? (
              <div>
                <p className="eyebrow mb-2">{L.fonts}</p>
                <div className="card space-y-1">
                  {headingFont ? (
                    <p className="heading text-[24px]">
                      {headingFont} <span className="text-[11px] text-black/50">· {L.heading}</span>
                    </p>
                  ) : null}
                  {bodyFont ? (
                    <p className="text-[15px]">
                      {bodyFont} <span className="text-[11px] text-black/50">· {L.body}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {deck.brand.tone_words.length ? (
              <div>
                <p className="eyebrow mb-2">{L.tone}</p>
                <div className="flex flex-wrap gap-2">
                  {deck.brand.tone_words.map((w, i) => (
                    <span
                      key={i}
                      className="heading dark-text rounded-full border border-[var(--deck-dark)]/20 bg-white px-3 py-1 text-[14px]"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid content-start gap-3">
            <div className="card">
              <p className="mb-2 flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                <Check className="size-4" /> {L.do}
              </p>
              <Bullets items={deck.brand.dos} />
            </div>
            <div className="card">
              <p className="mb-2 flex items-center gap-1 text-[12px] font-semibold text-red-700">
                <X className="size-4" /> {L.dont}
              </p>
              <Bullets items={deck.brand.donts} />
            </div>
          </div>
        </div>
      </Slide>

      {/* Budget and channel mix */}
      {mix.length ? (
        <Slide eyebrow={project.name} title={S.budget} page={next()}>
          <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
            <div>
              {budget != null ? (
                <>
                  <p className="text-[11px] tracking-wide text-black/50 uppercase">{L.total}</p>
                  <p className="heading dark-text text-[clamp(28px,3.6vw,44px)] font-semibold">
                    {formatMoney(locale, budget)}
                  </p>
                </>
              ) : null}
              <div className="mt-4 flex h-3 overflow-hidden rounded-full">
                {mix.map((r, i) => (
                  <div
                    key={i}
                    style={{ width: `${r.pct}%`, background: shade(i) }}
                    title={r.channel}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              {mix.map((r, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <span className="size-2.5 rounded-sm" style={{ background: shade(i) }} />
                    {r.channel}
                  </span>
                  <div>
                    <div className="h-2 rounded-full bg-black/5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.pct}%`, background: shade(i) }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-black/55">{r.purpose}</p>
                  </div>
                  <span className="text-right text-[13px] tabular-nums">
                    <b>{Math.round(r.pct)}%</b>
                    {r.amount != null || budget != null ? (
                      <span className="block text-[11px] text-black/50">
                        {formatMoneyCompact(locale, r.amount ?? ((budget ?? 0) * r.pct) / 100)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Slide>
      ) : null}

      {/* Funnel */}
      {funnel.length ? (
        <Slide eyebrow={project.name} title={S.funnel} page={next()} tone="light">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
            {funnel.map((f, i) => {
              const w = funnel.length > 1 ? 100 - (i * 55) / (funnel.length - 1) : 100;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md px-4 py-2.5 text-white"
                  style={{
                    width: `${w}%`,
                    background: i === funnel.length - 1 ? "var(--deck-accent)" : "var(--deck-dark)",
                    color: i === funnel.length - 1 ? "var(--deck-on-accent)" : "#fff",
                    opacity: i === funnel.length - 1 ? 1 : 1 - i * 0.12,
                  }}
                >
                  <span className="text-[13px]">{f.stage}</span>
                  <span className="heading text-[18px] font-semibold tabular-nums">
                    {formatNumber(locale, f.count)}
                  </span>
                </div>
              );
            })}
          </div>
        </Slide>
      ) : null}

      {/* Roadmap */}
      {deck.phases.length ? (
        <Slide eyebrow={project.name} title={S.roadmap} page={next()}>
          <div className="relative">
            <div className="absolute top-[13px] right-0 left-0 h-0.5 bg-black/10" />
            <div
              className="relative grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${Math.min(deck.phases.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {deck.phases.map((p, i) => (
                <div key={i}>
                  <span className="accent-bg relative z-[1] flex size-7 items-center justify-center rounded-full text-[12px] font-semibold">
                    {i + 1}
                  </span>
                  <h3 className="heading dark-text mt-3 text-[17px] font-semibold">{p.name}</h3>
                  <p className="text-[12px] text-black/50">{p.timing}</p>
                  <p className="mt-2 text-[13px] font-medium">{p.goal}</p>
                  <Bullets items={p.activities} className="mt-2" />
                  {p.kpis.length ? (
                    <div className="mt-3 rounded-md bg-[var(--deck-light)] px-2.5 py-2">
                      <p className="eyebrow mb-1">{L.kpis}</p>
                      <Bullets items={p.kpis} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Slide>
      ) : null}

      {/* Campaigns by target group */}
      <Slide eyebrow={project.name} title={S.campaigns} page={next()} tone="light">
        {campaigns.length ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.slice(0, 9).map((c) => (
              <div key={c.id} className="card space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-black/50">{c.code}</span>
                  <span className="text-[11px] text-black/50">
                    {label(t.marketing.campaigns.status, c.status)}
                  </span>
                </div>
                <h3 className="heading dark-text text-[15px] font-semibold leading-snug">
                  {c.name}
                </h3>
                {c.audience ? (
                  <p className="line-clamp-3 text-[12px] leading-snug text-black/65">
                    {c.audience}
                  </p>
                ) : null}
                <p className="text-[11px] text-black/55">
                  {(c.channels ?? []).map((ch) => label(t.marketing.channel, ch)).join(" · ")}
                  {c.languages?.length ? ` · ${c.languages.join("/")}` : ""}
                </p>
                <div className="flex gap-4 border-t border-black/5 pt-1.5 text-[12px]">
                  {c.budget != null ? <b>{formatMoneyCompact(locale, c.budget)}</b> : null}
                  {c.goal_leads ? (
                    <span>
                      {formatNumber(locale, c.goal_leads)} {L.leads}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-black/55">{L.noCampaigns}</p>
        )}
      </Slide>

      {/* Guardrails and next steps */}
      <Slide eyebrow={project.name} title={S.guardrails} page={next()}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card">
            <Bullets items={deck.cautions} />
          </div>
          <div>
            <p className="eyebrow mb-2">{S.next}</p>
            <ol className="space-y-2">
              {deck.next_steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[13px]">
                  <span className="accent-bg flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    {s.task}
                    {s.owner ? <span className="ml-1 text-black/50">· {s.owner}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Slide>
    </>
  );
}

/** Colours for the budget bars: the brand's dark, its accent, then lighter tints of the dark. */
function shade(i: number) {
  const list = [
    "var(--deck-dark)",
    "var(--deck-accent)",
    "color-mix(in srgb, var(--deck-dark) 70%, white)",
    "color-mix(in srgb, var(--deck-accent) 60%, white)",
    "color-mix(in srgb, var(--deck-dark) 45%, white)",
    "color-mix(in srgb, var(--deck-accent) 35%, white)",
    "color-mix(in srgb, var(--deck-dark) 25%, white)",
  ];
  return list[i % list.length];
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
