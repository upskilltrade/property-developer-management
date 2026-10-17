import type { Dictionary, Locale } from "@/lib/i18n";
import { projectStatuses } from "@/lib/status";
import { Field, FormGrid, Hidden, Input, Select } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

type ProjectValues = {
  id?: string;
  code?: string | null;
  name?: string | null;
  status?: string | null;
  target_completion_date?: string | null;
};

export function ProjectForm({
  t,
  locale,
  action,
  project = {},
}: {
  t: Dictionary;
  locale: Locale;
  action: (fd: FormData) => Promise<void>;
  project?: ProjectValues;
}) {
  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ locale, id: project.id }} />
      <FormGrid>
        <Field label={t.projects.fields.code} required>
          <Input
            name="code"
            required
            defaultValue={project.code ?? ""}
            placeholder="P001"
            className="uppercase"
          />
        </Field>
        <Field label={t.projects.fields.status}>
          <Select name="status" defaultValue={project.status ?? "PLANNING"}>
            {projectStatuses.map((s) => (
              <option key={s} value={s}>
                {t.status.project[s]}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label={t.projects.fields.name} required>
        <Input name="name" required defaultValue={project.name ?? ""} />
      </Field>
      <Field label={t.projects.fields.target}>
        <Input
          name="target_completion_date"
          type="date"
          defaultValue={project.target_completion_date ?? ""}
        />
      </Field>
      <SheetFooter>
        <SubmitButton>{t.common.save}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
