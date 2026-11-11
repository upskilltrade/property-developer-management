import type { Dictionary } from "@/lib/i18n";
import type { Tone } from "@/lib/status";
import { campaignObjectives, campaignStatuses, channels, copyLanguages } from "@/lib/marketing";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";

export const assetTone: Record<string, Tone> = {
  DRAFT: "warning",
  REVIEW: "accent",
  APPROVED: "success",
  ARCHIVED: "neutral",
};
export const campaignTone: Record<string, Tone> = {
  DRAFT: "warning",
  PLANNED: "info",
  ACTIVE: "success",
  PAUSED: "neutral",
  DONE: "neutral",
  CANCELLED: "danger",
};

export function CampaignForm({
  t,
  action,
  hidden,
  campaign,
}: {
  t: Dictionary;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  campaign?: Record<string, unknown> | null;
}) {
  const c = t.marketing.campaigns;
  const v = (k: string) => (campaign?.[k] as string | number | null | undefined) ?? "";
  const list = (k: string, fallback: string[]) =>
    (campaign?.[k] as string[] | undefined) ?? fallback;
  const picked = new Set(list("channels", ["FACEBOOK", "INSTAGRAM"]));
  const langs = new Set(list("languages", ["TH", "EN"]));
  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, campaign_id: String(campaign?.id ?? "") }} />
      <FormGrid>
        <Field label={c.fields.code} required>
          <Input
            name="code"
            required
            defaultValue={v("code")}
            placeholder="LAUNCH-Q1"
            className="font-mono uppercase"
          />
        </Field>
        <Field label={c.fields.name} required>
          <Input name="name" required defaultValue={v("name")} />
        </Field>
      </FormGrid>
      <FormGrid cols={3}>
        <Field label={c.fields.objective}>
          <Select name="objective" defaultValue={String(v("objective") || "LEADS")}>
            {campaignObjectives.map((o) => (
              <option key={o} value={o}>
                {c.objective[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={c.fields.start_date}>
          <Input name="start_date" type="date" defaultValue={v("start_date")} />
        </Field>
        <Field label={c.fields.end_date}>
          <Input name="end_date" type="date" defaultValue={v("end_date")} />
        </Field>
        <Field label={c.fields.budget}>
          <Input name="budget" inputMode="decimal" defaultValue={v("budget")} />
        </Field>
        <Field label={c.fields.goal_leads}>
          <Input name="goal_leads" inputMode="numeric" defaultValue={v("goal_leads")} />
        </Field>
        <Field label={c.fields.goal_bookings}>
          <Input name="goal_bookings" inputMode="numeric" defaultValue={v("goal_bookings")} />
        </Field>
      </FormGrid>
      <Field label={c.fields.status}>
        <Select name="status" defaultValue={String(v("status") || "DRAFT")}>
          {campaignStatuses.map((s) => (
            <option key={s} value={s}>
              {c.status[s]}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-2xs font-medium text-ink-2">{c.fields.channels}</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {channels.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" name="channels" value={ch} defaultChecked={picked.has(ch)} />
              {t.marketing.channel[ch]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-2xs font-medium text-ink-2">{c.fields.languages}</legend>
        <div className="flex flex-wrap gap-3">
          {copyLanguages.map((l) => (
            <label key={l} className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" name="languages" value={l} defaultChecked={langs.has(l)} />
              {t.marketing.language[l]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={c.fields.audience}>
        <Textarea name="audience" defaultValue={v("audience")} />
      </Field>
      <FormGrid>
        <Field label={c.fields.key_message}>
          <Textarea name="key_message" defaultValue={v("key_message")} />
        </Field>
        <Field label={c.fields.offer}>
          <Textarea name="offer" defaultValue={v("offer")} />
        </Field>
      </FormGrid>
      <Field label={c.fields.lead_tag} hint={c.leadTagHint}>
        <Input name="lead_tag" defaultValue={v("lead_tag")} />
      </Field>
      <Field label={c.fields.notes}>
        <Textarea name="notes" defaultValue={v("notes")} />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
