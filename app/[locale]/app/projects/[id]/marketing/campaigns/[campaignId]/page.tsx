import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Paperclip,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai";
import { resolveLocale, type Dictionary } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import {
  campaignDays,
  channels,
  copyFormats,
  copyLanguages,
  costPer,
  fileKind,
  leadTagKey,
  summarizeLeads,
  type LeadStatRow,
} from "@/lib/marketing";
import { Panel, DetailList } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Kpi, KpiStrip } from "@/components/ui/kpi";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import type { Tone } from "@/lib/status";
import {
  attachAssets,
  deleteCampaign,
  deleteCopy,
  detachAsset,
  draftCampaignWithAi,
  saveCampaign,
  saveCopy,
  setCopyStatus,
} from "../../actions";
import { assetTone, campaignTone, CampaignForm } from "../../parts";

export const metadata: Metadata = { title: "Campaign" };
export const maxDuration = 300;

const copyTone: Record<string, Tone> = {
  DRAFT: "warning",
  APPROVED: "success",
  USED: "info",
  ARCHIVED: "neutral",
};

type Concept = {
  big_idea?: string;
  insight?: string;
  angles?: string[];
  key_visual?: string;
  hashtags?: string[];
};

/** One campaign: brief, AI concept, copy drafts per channel and language, and its files. */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; campaignId: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id, campaignId } = await params;
  const q = await searchParams;
  const { supabase } = await getStaffSession(locale);
  const m = t.marketing;
  const c = m.campaigns;
  const base = `/${locale}/app/projects/${id}/marketing`;
  const self = `${base}/campaigns/${campaignId}`;
  const back = q.channel ? `${self}?channel=${q.channel}` : self;

  const { data: campaign } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("project_id", id)
    .maybeSingle();
  if (!campaign) notFound();

  const [
    { data: canEdit },
    { data: canApprove },
    { data: copies },
    { data: links },
    { data: assets },
    { data: leadRows },
  ] = await Promise.all([
    supabase.rpc("can_market", { target_project: id, target_action: "EDIT" }),
    supabase.rpc("can_market", { target_project: id, target_action: "APPROVE" }),
    supabase
      .from("marketing_copies")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("channel")
      .order("language")
      .order("created_at"),
    supabase.from("marketing_campaign_assets").select("asset_id").eq("campaign_id", campaignId),
    supabase
      .from("marketing_assets")
      .select(
        "id,category,title,status,files:marketing_asset_files(path,version_no,file_name,mime_type)",
      )
      .eq("project_id", id)
      .neq("status", "ARCHIVED")
      .order("category")
      .order("title"),
    supabase.rpc("marketing_lead_stats", { target_project: id }),
  ]);

  const hidden = { locale, return_to: back, project_id: id, campaign_id: campaignId };
  const attachedIds = new Set((links ?? []).map((l) => l.asset_id));
  const latestFile = (a: NonNullable<typeof assets>[number]) =>
    [
      ...((a.files ?? []) as {
        path: string;
        version_no: number;
        file_name: string | null;
        mime_type: string | null;
      }[]),
    ].sort((x, y) => y.version_no - x.version_no)[0];
  const attached = (assets ?? []).filter((a) => attachedIds.has(a.id));
  const attachable = (assets ?? []).filter((a) => !attachedIds.has(a.id));
  const paths = attached.map((a) => latestFile(a)?.path).filter(Boolean) as string[];
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

  const tag = campaign.lead_tag || campaign.code;
  const r = summarizeLeads((leadRows ?? []) as LeadStatRow[]).byTag.get(leadTagKey(tag) ?? "");
  const days = campaignDays(campaign.start_date, campaign.end_date);
  const concept = (campaign.concept ?? null) as Concept | null;
  const usedChannels = [...new Set((copies ?? []).map((x) => x.channel))];
  const shownCopies = (copies ?? []).filter((x) => !q.channel || x.channel === q.channel);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`${base}?view=campaigns`}
            className="inline-flex items-center gap-1 text-2xs text-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" />
            {m.views.campaigns}
          </Link>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {campaign.name}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-2xs text-ink-2">
              {campaign.code}
            </span>
            <Badge tone={campaignTone[campaign.status]}>{label(c.status, campaign.status)}</Badge>
          </h2>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Sheet
              title={m.ai.title}
              triggerLabel={m.ai.button}
              triggerIcon={<Sparkles />}
              triggerSize="xs"
            >
              {aiConfigured() ? (
                <form action={draftCampaignWithAi} className="space-y-3">
                  <Hidden values={hidden} />
                  <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{m.ai.body}</p>
                  <p className="text-2xs text-muted">
                    {c.fields.channels}:{" "}
                    {(campaign.channels?.length ? campaign.channels : ["FACEBOOK", "INSTAGRAM"])
                      .map((ch: string) => label(m.channel, ch))
                      .join(", ")}
                    {" · "}
                    {c.fields.languages}:{" "}
                    {(campaign.languages?.length ? campaign.languages : ["TH", "EN"])
                      .map((l: string) => label(m.language, l))
                      .join(", ")}
                  </p>
                  <Field label={m.ai.instructions} hint={m.ai.instructionsHint}>
                    <Textarea name="instructions" />
                  </Field>
                  {concept ? <p className="text-2xs text-amber-700">{m.ai.replaceNote}</p> : null}
                  <SheetFooter>
                    <SubmitButton>
                      <Sparkles />
                      {m.ai.run}
                    </SubmitButton>
                  </SheetFooter>
                </form>
              ) : (
                <p className="text-[13px] text-muted">{m.ai.notConfigured}</p>
              )}
            </Sheet>
            <Sheet
              title={c.edit}
              triggerLabel={t.common.edit}
              triggerIcon={<Pencil />}
              triggerVariant="secondary"
              triggerSize="xs"
              width="lg"
            >
              <CampaignForm t={t} action={saveCampaign} hidden={hidden} campaign={campaign} />
              <form
                action={deleteCampaign}
                className="mt-6 flex items-center justify-between gap-2 rounded-md border border-red-200 p-3"
              >
                <Hidden values={hidden} />
                <span className="text-2xs text-red-700">{c.deleteConfirm}</span>
                <SubmitButton variant="danger" size="xs">
                  <Trash2 />
                  {c.delete}
                </SubmitButton>
              </form>
            </Sheet>
          </div>
        ) : null}
      </div>

      <KpiStrip cols={5}>
        <Kpi
          label={c.fields.budget}
          value={campaign.budget != null ? formatMoney(locale, campaign.budget) : "—"}
          sub={days ? c.days.replace("{n}", String(days)) : undefined}
        />
        <Kpi
          label={c.fields.period}
          value={`${formatDate(locale, campaign.start_date)} – ${formatDate(locale, campaign.end_date)}`}
          sub={label(c.objective, campaign.objective)}
        />
        <Kpi
          label={m.kpi.leads}
          value={formatNumber(locale, r?.leads ?? 0)}
          sub={
            campaign.goal_leads
              ? `${m.kpi.ofGoal} ${formatNumber(locale, campaign.goal_leads)}`
              : c.leadsHint.replace("{tag}", tag)
          }
          tone="brand"
        />
        <Kpi
          label={m.kpi.booked}
          value={formatNumber(locale, r?.booked ?? 0)}
          sub={
            campaign.goal_bookings
              ? `${m.kpi.ofGoal} ${formatNumber(locale, campaign.goal_bookings)}`
              : undefined
          }
          tone={r?.booked ? "positive" : "default"}
        />
        <Kpi
          label={m.kpi.cpl}
          value={(() => {
            const v = costPer(Number(campaign.budget), r?.leads ?? 0);
            return v == null ? "—" : formatMoney(locale, Math.round(v));
          })()}
        />
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={c.brief}>
          <DetailList
            items={[
              { label: c.fields.objective, value: label(c.objective, campaign.objective) },
              {
                label: c.fields.channels,
                value:
                  (campaign.channels ?? []).map((ch: string) => label(m.channel, ch)).join(", ") ||
                  "—",
              },
              {
                label: c.fields.languages,
                value:
                  (campaign.languages ?? []).map((l: string) => label(m.language, l)).join(", ") ||
                  "—",
              },
              { label: c.fields.audience, value: <Multiline text={campaign.audience} /> },
              { label: c.fields.key_message, value: <Multiline text={campaign.key_message} /> },
              { label: c.fields.offer, value: <Multiline text={campaign.offer} /> },
              { label: c.fields.lead_tag, value: <span className="font-mono">{tag}</span> },
              { label: c.fields.notes, value: <Multiline text={campaign.notes} /> },
            ]}
          />
        </Panel>

        <Panel title={c.concept} className="lg:col-span-2">
          {concept?.big_idea ? (
            <div className="space-y-3 p-4 text-[13px]">
              <div>
                <p className="text-2xs font-semibold tracking-wide text-muted uppercase">
                  {c.bigIdea}
                </p>
                <p className="text-lg font-semibold text-brand">{concept.big_idea}</p>
              </div>
              {concept.insight ? (
                <div>
                  <p className="text-2xs font-semibold tracking-wide text-muted uppercase">
                    {c.insight}
                  </p>
                  <p>{concept.insight}</p>
                </div>
              ) : null}
              {concept.angles?.length ? (
                <div>
                  <p className="text-2xs font-semibold tracking-wide text-muted uppercase">
                    {c.angles}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {concept.angles.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {concept.key_visual ? (
                <div>
                  <p className="text-2xs font-semibold tracking-wide text-muted uppercase">
                    {c.keyVisual}
                  </p>
                  <p>{concept.key_visual}</p>
                </div>
              ) : null}
              {concept.hashtags?.length ? (
                <p className="text-2xs text-brand">
                  {concept.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState icon={<Sparkles />} title={c.noConcept} />
          )}
        </Panel>
      </div>

      <Panel
        title={m.copies.title}
        description={`${formatNumber(locale, copies?.length ?? 0)}`}
        actions={
          canEdit ? (
            <Sheet title={m.copies.add} triggerLabel={m.copies.add} triggerSize="xs" width="lg">
              <CopyForm
                t={t}
                hidden={hidden}
                defaults={{ channel: q.channel ?? campaign.channels?.[0] }}
              />
            </Sheet>
          ) : null
        }
      >
        {usedChannels.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
            {[null, ...usedChannels].map((ch) => {
              const on = (q.channel ?? null) === ch;
              return (
                <Link
                  key={ch ?? "all"}
                  href={ch ? `${self}?channel=${ch}` : self}
                  className={`rounded-full px-2.5 py-1 text-2xs font-medium ${on ? "bg-brand text-white" : "bg-subtle text-ink-2 hover:text-ink"}`}
                >
                  {ch ? label(m.channel, ch) : m.copies.filterAll}
                </Link>
              );
            })}
          </div>
        ) : null}
        {shownCopies.length ? (
          <ul className="grid gap-3 p-4 lg:grid-cols-2">
            {shownCopies.map((x) => {
              const full = [x.headline, x.body, x.cta, x.hashtags].filter(Boolean).join("\n\n");
              const locked = x.status === "APPROVED" && !canApprove;
              return (
                <li
                  key={x.id}
                  className="flex flex-col rounded-lg border border-line p-3 text-[13px]"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone="info">{label(m.channel, x.channel)}</Badge>
                    <Badge>{label(m.copies.format, x.format)}</Badge>
                    <Badge>{label(m.language, x.language)}</Badge>
                    {x.source === "AI" ? <Badge tone="accent">{m.copies.ai}</Badge> : null}
                    <Badge tone={copyTone[x.status]}>{label(m.copies.status, x.status)}</Badge>
                  </div>
                  {x.headline ? <p className="font-semibold">{x.headline}</p> : null}
                  <p className="mt-1 whitespace-pre-line text-ink-2">{x.body}</p>
                  {x.cta ? <p className="mt-2 font-medium text-brand">{x.cta}</p> : null}
                  {x.hashtags ? <p className="mt-1 text-2xs text-brand">{x.hashtags}</p> : null}
                  {x.visual_idea ? (
                    <p className="mt-2 rounded-md bg-subtle px-2 py-1 text-2xs text-muted">
                      <span className="font-medium">{m.copies.fields.visual_idea}: </span>
                      {x.visual_idea}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                    <CopyButton value={full} label={m.copies.copy} />
                    {canEdit && !locked ? (
                      <>
                        <Sheet
                          title={m.copies.edit}
                          triggerLabel={t.common.edit}
                          triggerIcon={<Pencil />}
                          triggerVariant="ghost"
                          triggerSize="xs"
                          width="lg"
                        >
                          <CopyForm t={t} hidden={{ ...hidden, copy_id: x.id }} defaults={x} />
                        </Sheet>
                        {(["APPROVED", "USED", "DRAFT", "ARCHIVED"] as const)
                          .filter((s) => s !== x.status && (s !== "APPROVED" || canApprove))
                          .map((s) => (
                            <form key={s} action={setCopyStatus}>
                              <Hidden values={{ ...hidden, copy_id: x.id, status: s }} />
                              <SubmitButton
                                variant={s === "APPROVED" ? "primary" : "ghost"}
                                size="xs"
                              >
                                {m.copies.actions[s]}
                              </SubmitButton>
                            </form>
                          ))}
                        <form action={deleteCopy} className="ml-auto">
                          <Hidden values={{ ...hidden, copy_id: x.id }} />
                          <SubmitButton
                            variant="ghost"
                            size="xs"
                            aria-label={m.copies.delete}
                            title={m.copies.delete}
                          >
                            <Trash2 className="text-red-600" />
                          </SubmitButton>
                        </form>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<FileText />} title={m.copies.empty} />
        )}
      </Panel>

      <Panel
        title={c.files}
        actions={
          canEdit ? (
            <Sheet
              title={c.attach}
              triggerLabel={c.attach}
              triggerIcon={<Paperclip />}
              triggerVariant="secondary"
              triggerSize="xs"
            >
              {attachable.length ? (
                <form action={attachAssets} className="space-y-3">
                  <Hidden values={hidden} />
                  <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
                    {attachable.map((a) => (
                      <li key={a.id}>
                        <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-subtle">
                          <input type="checkbox" name="asset_id" value={a.id} />
                          <span className="min-w-0 flex-1 truncate">{a.title}</span>
                          <span className="text-2xs text-muted">
                            {label(m.assets.category, a.category)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <SheetFooter>
                    <SubmitButton>{c.attach}</SubmitButton>
                  </SheetFooter>
                </form>
              ) : (
                <p className="text-[13px] text-muted">{c.attachEmpty}</p>
              )}
            </Sheet>
          ) : null
        }
      >
        {attached.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
            {attached.map((a) => {
              const f = latestFile(a);
              return (
                <li key={a.id} className="overflow-hidden rounded-md border border-line">
                  <a
                    href={f ? previewUrl.get(f.path) : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="grid aspect-square place-items-center bg-subtle"
                  >
                    {f && fileKind(f.mime_type, f.file_name) === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl.get(f.path)}
                        alt={a.title}
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <FileText className="size-8 text-faint" />
                    )}
                  </a>
                  <div className="space-y-1 p-2">
                    <p className="truncate text-2xs font-medium" title={a.title}>
                      {a.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge tone={assetTone[a.status]}>{label(m.assets.status, a.status)}</Badge>
                      {f ? (
                        <a
                          href={downloadUrl.get(f.path)}
                          className="text-brand"
                          title={m.assets.download}
                        >
                          <Download className="size-3.5" />
                        </a>
                      ) : null}
                      {canEdit ? (
                        <form action={detachAsset} className="ml-auto">
                          <Hidden values={{ ...hidden, asset_id: a.id }} />
                          <button
                            type="submit"
                            className="text-muted hover:text-red-600"
                            title={c.detach}
                            aria-label={c.detach}
                          >
                            <X className="size-3.5" />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Paperclip />} title={c.noFiles} />
        )}
      </Panel>
    </div>
  );
}

function Multiline({ text }: { text: string | null }) {
  return text ? <span className="font-normal whitespace-pre-line">{text}</span> : <>—</>;
}

function CopyForm({
  t,
  hidden,
  defaults,
}: {
  t: Dictionary;
  hidden: Record<string, string>;
  defaults: {
    channel?: string | null;
    format?: string | null;
    language?: string | null;
    headline?: string | null;
    body?: string | null;
    cta?: string | null;
    hashtags?: string | null;
    visual_idea?: string | null;
  };
}) {
  const f = t.marketing.copies.fields;
  return (
    <form action={saveCopy} className="space-y-3">
      <Hidden values={hidden} />
      <FormGrid cols={3}>
        <Field label={f.channel}>
          <Select name="channel" defaultValue={defaults.channel ?? "FACEBOOK"}>
            {channels.map((ch) => (
              <option key={ch} value={ch}>
                {t.marketing.channel[ch]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={f.format}>
          <Select name="format" defaultValue={defaults.format ?? "POST"}>
            {copyFormats.map((x) => (
              <option key={x} value={x}>
                {t.marketing.copies.format[x]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={f.language}>
          <Select name="language" defaultValue={defaults.language ?? "TH"}>
            {copyLanguages.map((l) => (
              <option key={l} value={l}>
                {t.marketing.language[l]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={f.headline}>
        <Input name="headline" defaultValue={defaults.headline ?? ""} />
      </Field>
      <Field label={f.body} required>
        <Textarea name="body" required rows={8} defaultValue={defaults.body ?? ""} />
      </Field>
      <FormGrid>
        <Field label={f.cta}>
          <Input name="cta" defaultValue={defaults.cta ?? ""} />
        </Field>
        <Field label={f.hashtags}>
          <Input name="hashtags" defaultValue={defaults.hashtags ?? ""} />
        </Field>
      </FormGrid>
      <Field label={f.visual_idea}>
        <Textarea name="visual_idea" defaultValue={defaults.visual_idea ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
