import type { Dictionary } from "@/lib/i18n/dictionaries/th";
import { leadSources } from "@/lib/sales";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

type Option = { id: string; label: string };
export type LeadValues = {
  id?: string;
  project_id?: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  line_id?: string | null;
  source?: string;
  campaign?: string | null;
  budget?: number | string | null;
  interested_unit_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
};

/** Create / edit lead. Project is fixed once the lead exists. */
export function LeadForm({
  t,
  locale,
  action,
  returnTo,
  projects,
  units,
  members,
  lead = {},
}: {
  t: Pick<Dictionary, "sales" | "status" | "common">;
  locale: string;
  action: (fd: FormData) => Promise<void>;
  returnTo: string;
  projects: Option[];
  units: (Option & { project_id: string })[];
  members: Option[];
  lead?: LeadValues;
}) {
  const f = t.sales.fields;
  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ locale, return_to: returnTo, lead_id: lead.id ?? "" }} />
      {lead.id ? (
        <input type="hidden" name="project_id" value={lead.project_id} />
      ) : (
        <Field label={f.project} required>
          <Select
            name="project_id"
            required
            defaultValue={lead.project_id ?? projects[0]?.id ?? ""}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={f.name} required>
        <Input name="full_name" required defaultValue={lead.full_name ?? ""} />
      </Field>
      <FormGrid cols={3}>
        <Field label={f.phone}>
          <Input name="phone" type="tel" defaultValue={lead.phone ?? ""} />
        </Field>
        <Field label={f.email}>
          <Input name="email" type="email" defaultValue={lead.email ?? ""} />
        </Field>
        <Field label={f.line}>
          <Input name="line_id" defaultValue={lead.line_id ?? ""} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={f.source}>
          <Select name="source" defaultValue={lead.source ?? "WALK_IN"}>
            {leadSources.map((s) => (
              <option key={s} value={s}>
                {t.status.leadSource[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={f.campaign}>
          <Input name="campaign" defaultValue={lead.campaign ?? ""} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={f.budget}>
          <Input name="budget" type="number" min="0" step="1000" defaultValue={lead.budget ?? ""} />
        </Field>
        <Field label={f.interestedUnit}>
          <Select name="interested_unit_id" defaultValue={lead.interested_unit_id ?? ""}>
            <option value="">—</option>
            {units
              .filter((u) => !lead.project_id || u.project_id === lead.project_id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
          </Select>
        </Field>
      </FormGrid>
      {members.length > 1 ? (
        <Field label={f.assignedTo}>
          <Select name="assigned_to" defaultValue={lead.assigned_to ?? ""}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label={f.notes}>
        <Textarea name="notes" defaultValue={lead.notes ?? ""} />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
