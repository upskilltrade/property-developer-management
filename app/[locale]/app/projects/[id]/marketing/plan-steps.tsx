import { FileText, Sparkles, Upload } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { formatDateTime } from "@/lib/format";
import { aiReadable, formatBytes, planSourceCategories } from "@/lib/marketing";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Hidden, Input, Textarea } from "@/components/ui/field";
import { MarketingUploadForm } from "@/components/domain/marketing-upload-form";
import { createAsset, draftPlanWithAi, saveRawBrief } from "./actions";

export type SourceAsset = {
  id: string;
  title: string;
  category: string;
  file: { file_name: string | null; mime_type: string | null; size_bytes: number | null } | null;
};

/**
 * Steps 1 and 2 of the marketing plan: the raw project data (pasted brief plus project files) and
 * the AI analysis that reads it, with the project's CI, logo and brochures, to draft the plan.
 */
export function PlanSteps({
  t,
  locale,
  hidden,
  folder,
  rawBrief,
  aiSummary,
  aiDraftedAt,
  sources,
  aiEnabled,
}: {
  t: Dictionary;
  locale: Locale;
  hidden: Record<string, string>;
  folder: string;
  rawBrief: string | null;
  aiSummary: string | null;
  aiDraftedAt: string | null;
  sources: SourceAsset[];
  aiEnabled: boolean;
}) {
  const p = t.marketing.plan;
  const readable = (s: SourceAsset) =>
    s.file ? aiReadable(s.file.mime_type, s.file.file_name, s.file.size_bytes) : null;
  const projectFiles = sources.filter((s) => s.category === "PROJECT_DATA");
  // Default selection: readable files of the plan's source categories, project data first.
  const ordered = [...sources].sort(
    (a, b) =>
      planSourceCategories.indexOf(a.category as never) -
      planSourceCategories.indexOf(b.category as never),
  );
  let picked = 0;
  const defaultOn = new Set(ordered.filter((s) => readable(s) && picked++ < 10).map((s) => s.id));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={p.steps.raw} description={p.steps.rawBody}>
        <form action={saveRawBrief} className="space-y-3 p-4">
          <Hidden values={hidden} />
          <Field label={p.raw.brief} hint={p.raw.briefHint}>
            <Textarea name="raw_brief" rows={10} defaultValue={rawBrief ?? ""} />
          </Field>
          <div className="flex justify-end">
            <SubmitButton variant="secondary" size="xs">
              {p.raw.save}
            </SubmitButton>
          </div>
        </form>
        <div className="space-y-2 border-t border-line px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold tracking-wide text-muted uppercase">
              {label(t.marketing.assets.category, "PROJECT_DATA")}
            </span>
            <Sheet
              title={p.raw.upload}
              triggerLabel={p.raw.upload}
              triggerIcon={<Upload />}
              triggerVariant="secondary"
              triggerSize="xs"
            >
              <MarketingUploadForm
                action={createAsset}
                hidden={{ ...hidden, category: "PROJECT_DATA" }}
                folder={folder}
                labels={{
                  file: t.marketing.assets.file,
                  submit: t.common.save,
                  uploadFailed: t.marketing.assets.uploadFailed,
                  tooLarge: t.marketing.assets.tooLarge,
                  hint: p.raw.unreadable,
                }}
              >
                <Field label={t.marketing.assets.fields.title} required>
                  <Input
                    name="title"
                    required
                    placeholder="Project deck / Master plan / Price list"
                  />
                </Field>
                <Field label={t.marketing.assets.fields.description}>
                  <Textarea name="description" />
                </Field>
              </MarketingUploadForm>
            </Sheet>
          </div>
          {projectFiles.length ? (
            <ul className="space-y-1">
              {projectFiles.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-[13px]">
                  <FileText className="size-3.5 text-faint" />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="text-2xs text-muted">{formatBytes(s.file?.size_bytes)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Panel>

      <Panel title={p.steps.ai} description={p.ai.body}>
        <div className="space-y-3 p-4">
          {aiDraftedAt ? (
            <div className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">
              <p className="font-medium text-ink-2">
                {p.ai.last.replace("{date}", formatDateTime(locale, aiDraftedAt))}
              </p>
              {aiSummary ? <p className="mt-1 whitespace-pre-line">{aiSummary}</p> : null}
            </div>
          ) : null}
          {aiEnabled ? (
            <Sheet
              title={p.ai.title}
              triggerLabel={p.ai.button}
              triggerIcon={<Sparkles />}
              width="lg"
            >
              <form action={draftPlanWithAi} className="space-y-3">
                <Hidden values={hidden} />
                <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{p.ai.body}</p>
                <Field label={p.raw.brief} hint={p.raw.briefHint}>
                  <Textarea name="raw_brief" rows={6} defaultValue={rawBrief ?? ""} />
                </Field>
                <fieldset>
                  <legend className="mb-1 text-2xs font-medium text-ink-2">{p.ai.pickFiles}</legend>
                  {ordered.length ? (
                    <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-line p-1">
                      {ordered.map((s) => {
                        const ok = readable(s);
                        return (
                          <li key={s.id}>
                            <label
                              className={`flex items-center gap-2 rounded px-2 py-1 text-[13px] ${ok ? "hover:bg-subtle" : "opacity-50"}`}
                              title={ok ? undefined : p.raw.unreadable}
                            >
                              <input
                                type="checkbox"
                                name="asset_id"
                                value={s.id}
                                disabled={!ok}
                                defaultChecked={defaultOn.has(s.id)}
                              />
                              <span className="min-w-0 flex-1 truncate">{s.title}</span>
                              <Badge>{label(t.marketing.assets.category, s.category)}</Badge>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-2xs text-muted">{p.raw.noFiles}</p>
                  )}
                </fieldset>
                <label className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" name="overwrite" className="mt-0.5" />
                  {p.ai.overwrite}
                </label>
                <SheetFooter>
                  <SubmitButton>
                    <Sparkles />
                    {p.ai.run}
                  </SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          ) : (
            <p className="text-[13px] text-muted">{t.marketing.ai.notConfigured}</p>
          )}
          <p className="text-2xs text-muted">
            {p.raw.files}: {sources.filter(readable).length}
          </p>
        </div>
      </Panel>
    </div>
  );
}
