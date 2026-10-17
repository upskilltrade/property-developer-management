import type { Metadata } from "next";
import { Images } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { activityName, scheduleStages } from "@/lib/schedule";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { PhotoThumb } from "@/components/domain/photo-thumb";

export const metadata: Metadata = { title: "Site photos" };

type Row = {
  id: string;
  unit_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  taken_at: string | null;
  uploaded_at: string;
  publication_status: string;
  activity: { code: string; name_th: string; name_en: string; stage: string } | null;
};

/** Every photo of the project in one feed, for site meetings and management review. */
export default async function PhotoLog({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    unit?: string;
    stage?: string;
    pub?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { id } = await params;
  const q = await searchParams;
  const { supabase } = await getSession(locale);
  const s = t.schedule;

  let query = supabase
    .from("activity_photos")
    .select(
      "id,unit_id,storage_path,thumbnail_path,caption,taken_at,uploaded_at,publication_status,activity:schedule_activities!inner(code,name_th,name_en,stage)",
    )
    .eq("project_id", id)
    .is("voided_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(200);
  if (q.unit === "project") query = query.is("unit_id", null);
  else if (q.unit) query = query.eq("unit_id", q.unit);
  if (q.stage) query = query.eq("activity.stage", q.stage);
  if (q.pub === "PUBLISHED" || q.pub === "INTERNAL") query = query.eq("publication_status", q.pub);
  if (q.from) query = query.gte("uploaded_at", q.from);
  if (q.to) query = query.lte("uploaded_at", `${q.to}T23:59:59`);

  const [{ data: rows }, { data: units }] = await Promise.all([
    query,
    supabase.from("units").select("id,code").eq("project_id", id).order("code"),
  ]);
  const photos = (rows ?? []) as unknown as Row[];
  const paths = photos.flatMap(
    (p) => [p.storage_path, p.thumbnail_path].filter(Boolean) as string[],
  );
  const { data: signed } = paths.length
    ? await supabase.storage.from("site-photos").createSignedUrls(paths, 3600)
    : { data: [] };
  const url = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
  const unitCode = new Map((units ?? []).map((u) => [u.id, u.code]));

  // Group by day for a readable feed.
  const days = new Map<string, Row[]>();
  for (const p of photos) {
    const d = (p.taken_at ?? p.uploaded_at).slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), p]);
  }

  return (
    <Panel
      title={s.photoLog}
      description={s.photoLogSubtitle}
      actions={
        <form className="flex flex-wrap items-center gap-2">
          <Select name="unit" defaultValue={q.unit ?? ""} className="w-36">
            <option value="">{t.common.all}</option>
            <option value="project">{s.projectWorks}</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.code}
              </option>
            ))}
          </Select>
          <Select name="stage" defaultValue={q.stage ?? ""} className="w-36">
            <option value="">{s.allStages}</option>
            {scheduleStages.map((st) => (
              <option key={st} value={st}>
                {t.status.stage[st]}
              </option>
            ))}
          </Select>
          <Select name="pub" defaultValue={q.pub ?? ""} className="w-32">
            <option value="">{t.common.all}</option>
            <option value="PUBLISHED">{s.published}</option>
            <option value="INTERNAL">{s.internal}</option>
          </Select>
          <input
            type="date"
            name="from"
            defaultValue={q.from ?? ""}
            className="h-8 rounded-md border border-line-strong px-2 text-[13px]"
          />
          <input
            type="date"
            name="to"
            defaultValue={q.to ?? ""}
            className="h-8 rounded-md border border-line-strong px-2 text-[13px]"
          />
          <button
            type="submit"
            className="h-8 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle"
          >
            {t.common.filter}
          </button>
        </form>
      }
    >
      {photos.length ? (
        <div className="space-y-5 p-4">
          {[...days].map(([day, list]) => (
            <section key={day}>
              <h3 className="mb-2 text-2xs font-semibold text-ink-2">
                {formatDate(locale, day)}{" "}
                <span className="font-normal text-muted num">· {list.length}</span>
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {list.map((p) => (
                  <PhotoThumb
                    key={p.id}
                    full={url.get(p.storage_path) ?? ""}
                    thumb={
                      url.get(p.thumbnail_path ?? p.storage_path) ?? url.get(p.storage_path) ?? ""
                    }
                    caption={p.caption ?? (p.activity ? activityName(p.activity, locale) : null)}
                    meta={p.unit_id ? unitCode.get(p.unit_id) : s.projectWorks}
                    published={p.publication_status === "PUBLISHED"}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Images />} title={s.noPhotos} />
      )}
    </Panel>
  );
}
