import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Download, Eye, EyeOff, ImageIcon, Repeat2, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import {
  configuredProviders,
  studioAspects,
  studioLighting,
  studioPurposes,
  studioScenes,
  studioStyles,
} from "@/lib/image-ai";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Hidden } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { StudioForm } from "@/components/domain/studio-form";
import { archiveRender, setRenderShared } from "./actions";

export const metadata: Metadata = { title: "AI Design Studio" };

type Render = {
  id: string;
  unit_id: string | null;
  scene: string;
  style: string;
  purpose: string;
  provider: string;
  model: string;
  prompt: string;
  brief: string | null;
  output_path: string;
  customer_visible: boolean;
  created_at: string;
};

export default async function DesignStudio({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ unit?: string; from?: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const { unit = "", from = "" } = await searchParams;
  const { supabase } = await getSession(locale);
  const s = t.studio;
  const base = `/${locale}/app/projects/${id}/studio`;

  let renderQuery = supabase
    .from("design_renders")
    .select(
      "id,unit_id,scene,style,purpose,provider,model,prompt,brief,output_path,customer_visible,created_at",
    )
    .eq("project_id", id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (unit) renderQuery = renderQuery.eq("unit_id", unit);
  const [{ data: renderRows }, { data: units }, { data: canEdit }] = await Promise.all([
    renderQuery,
    supabase.from("units").select("id,code").eq("project_id", id).order("code"),
    supabase.rpc("can_design", { target_project: id, target_action: "EDIT" }),
  ]);
  const renders = (renderRows ?? []) as Render[];
  const paths = renders.map((r) => r.output_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from("design-renders").createSignedUrls(paths, 3600)
    : { data: [] };
  const urlOf = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));
  const providers = configuredProviders();
  const parent = from ? renders.find((r) => r.id === from) : undefined;
  const hidden = (renderId: string) => ({
    locale,
    project_id: id,
    render_id: renderId,
    return_to: base,
  });
  const opts = <T extends string>(list: readonly T[], labels: Record<T, string>) =>
    list.map((v) => ({ value: v, label: labels[v] }));

  return (
    <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-violet-600" />
            {s.create}
          </span>
        }
        description={s.subtitle}
        bodyClassName="p-4"
      >
        {canEdit !== true ? (
          <p className="text-2xs text-muted">{s.viewOnly}</p>
        ) : !providers.length ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {s.notConfigured}
          </p>
        ) : (
          <StudioForm
            url={`${base}/generate`}
            labels={s}
            providers={providers.map((p) => ({ value: p, label: s.providers[p] }))}
            scenes={opts(studioScenes, s.scenes)}
            styles={opts(studioStyles, s.styles)}
            lightings={opts(studioLighting, s.lightings)}
            aspects={studioAspects.map((a) => ({ value: a, label: a }))}
            purposes={opts(studioPurposes, s.purposes)}
            units={(units ?? []).map((u) => ({ value: u.id, label: u.code }))}
            defaultUnit={parent?.unit_id ?? unit}
            parent={
              parent ? { id: parent.id, imageUrl: urlOf.get(parent.output_path) ?? null } : null
            }
            clearHref={unit ? `${base}?unit=${unit}` : base}
          />
        )}
      </Panel>

      <Panel
        title={s.gallery}
        actions={
          <div className="flex flex-wrap gap-1">
            {[{ id: "", code: s.noUnit }, ...(units ?? [])].map((u) => (
              <Link
                key={u.id || "all"}
                href={u.id ? `${base}?unit=${u.id}` : base}
                className={
                  unit === u.id
                    ? "rounded-md bg-brand px-2 py-0.5 text-2xs font-medium text-white"
                    : "rounded-md border border-line px-2 py-0.5 text-2xs text-ink-2 hover:bg-subtle"
                }
              >
                {u.code}
              </Link>
            ))}
          </div>
        }
        bodyClassName="p-4"
      >
        {renders.length ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {renders.map((r) => {
              const src = urlOf.get(r.output_path);
              return (
                <figure
                  key={r.id}
                  className="overflow-hidden rounded-lg border border-line bg-surface"
                >
                  {src ? (
                    <a href={src} target="_blank" rel="noreferrer" className="block bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`${s.scenes[r.scene as keyof typeof s.scenes] ?? r.scene}`}
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center bg-slate-100 text-faint">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  <figcaption className="space-y-2 p-3 text-2xs">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="accent">
                        {s.scenes[r.scene as keyof typeof s.scenes] ?? r.scene}
                      </Badge>
                      <Badge tone="neutral">
                        {s.styles[r.style as keyof typeof s.styles] ?? r.style}
                      </Badge>
                      {r.unit_id ? <Badge tone="info">{unitCode.get(r.unit_id)}</Badge> : null}
                      {r.customer_visible ? <Badge tone="success">{s.shared}</Badge> : null}
                    </div>
                    <p className="text-muted">
                      {s.providers[r.provider as keyof typeof s.providers] ?? r.provider} ·{" "}
                      {r.model} · {s.purposes[r.purpose as keyof typeof s.purposes] ?? r.purpose} ·{" "}
                      {formatDateTime(locale, r.created_at)}
                    </p>
                    {r.brief ? (
                      <p className="[overflow-wrap:anywhere] text-ink-2">{r.brief}</p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-faint">{s.prompt}</summary>
                      <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-faint">
                        {r.prompt}
                      </p>
                    </details>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {src ? (
                        <a
                          href={src}
                          download
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong px-2 font-medium hover:bg-subtle"
                        >
                          <Download className="size-3.5" />
                          {s.download}
                        </a>
                      ) : null}
                      {canEdit === true ? (
                        <>
                          <Link
                            href={`${base}?from=${r.id}${unit ? `&unit=${unit}` : ""}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong px-2 font-medium hover:bg-subtle"
                          >
                            <Repeat2 className="size-3.5" />
                            {s.iterate}
                          </Link>
                          {r.unit_id ? (
                            <form action={setRenderShared}>
                              <Hidden
                                values={{
                                  ...hidden(r.id),
                                  visible: r.customer_visible ? "0" : "1",
                                }}
                              />
                              <SubmitButton
                                size="xs"
                                variant={r.customer_visible ? "secondary" : "success"}
                              >
                                {r.customer_visible ? <EyeOff /> : <Eye />}
                                {r.customer_visible ? s.unshare : s.share}
                              </SubmitButton>
                            </form>
                          ) : null}
                          <form action={archiveRender} className="ml-auto">
                            <Hidden values={hidden(r.id)} />
                            <SubmitButton
                              size="xs"
                              variant="ghost"
                              aria-label={s.archive}
                              title={s.archive}
                            >
                              <Archive />
                            </SubmitButton>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Sparkles />} title={s.empty} />
        )}
      </Panel>
    </div>
  );
}
