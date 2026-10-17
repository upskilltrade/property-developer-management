"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Option = { value: string; label: string };
type Labels = {
  reference: string;
  referenceHint: string;
  fromRender: string;
  clearReference: string;
  provider: string;
  scene: string;
  style: string;
  lighting: string;
  aspect: string;
  purpose: string;
  unit: string;
  noUnit: string;
  materials: string;
  materialsPlaceholder: string;
  options: string;
  furniture: string;
  landscape: string;
  people: string;
  notes: string;
  notesPlaceholder: string;
  generate: string;
  generating: string;
  errors: Record<string, string>;
};

/** Design Studio brief: choices + optional reference image, posted to the generate route. */
export function StudioForm({
  url,
  labels,
  providers,
  scenes,
  styles,
  lightings,
  aspects,
  purposes,
  units,
  parent,
  defaultUnit,
  clearHref,
}: {
  url: string;
  labels: Labels;
  providers: Option[];
  scenes: Option[];
  styles: Option[];
  lightings: Option[];
  aspects: Option[];
  purposes: Option[];
  units: Option[];
  parent: { id: string; imageUrl: string | null } | null;
  defaultUnit: string;
  clearHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", body: new FormData(form) });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setError(labels.errors[json.error ?? "generic"] ?? labels.errors.generic);
        return;
      }
      form.reset();
      setPreview(null);
      router.push(clearHref);
      router.refresh();
    } catch {
      setError(labels.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      {parent ? (
        <div className="flex items-center gap-3 rounded-md border border-violet-200 bg-violet-50/50 p-2">
          <input type="hidden" name="parent_render_id" value={parent.id} />
          {parent.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={parent.imageUrl} alt="" className="h-14 w-20 rounded object-cover" />
          ) : null}
          <span className="flex-1 text-2xs text-violet-900">{labels.fromRender}</span>
          <a href={clearHref} className="text-2xs text-muted hover:text-ink">
            <X className="inline size-3.5" /> {labels.clearReference}
          </a>
        </div>
      ) : (
        <Field label={labels.reference} hint={labels.referenceHint}>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong p-2 hover:bg-subtle">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-14 w-20 rounded object-cover" />
            ) : (
              <ImagePlus className="size-5 text-muted" />
            )}
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-2xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
        </Field>
      )}
      <FormGrid>
        <Field label={labels.provider} required>
          <Select name="provider" defaultValue={providers[0]?.value}>
            {providers.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.unit}>
          <Select name="unit_id" defaultValue={defaultUnit}>
            <option value="">{labels.noUnit}</option>
            {units.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <FormGrid>
        {(
          [
            ["scene", labels.scene, scenes],
            ["style", labels.style, styles],
            ["lighting", labels.lighting, lightings],
            ["aspect", labels.aspect, aspects],
          ] as const
        ).map(([name, label, opts]) => (
          <Field key={name} label={label} required>
            <Select name={name} defaultValue={opts[0]?.value}>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </FormGrid>
      <Field label={labels.materials}>
        <Input name="materials" maxLength={500} placeholder={labels.materialsPlaceholder} />
      </Field>
      <fieldset>
        <legend className="mb-1 text-2xs font-medium text-ink-2">{labels.options}</legend>
        <div className="flex flex-wrap gap-4 text-[13px]">
          {(
            [
              ["furniture", labels.furniture, true],
              ["landscape", labels.landscape, true],
              ["people", labels.people, false],
            ] as const
          ).map(([name, label, on]) => (
            <label key={name} className="flex items-center gap-1.5">
              <input type="checkbox" name={name} defaultChecked={on} className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={labels.notes}>
        <Textarea name="notes" maxLength={1500} placeholder={labels.notesPlaceholder} />
      </Field>
      <Field label={labels.purpose}>
        <Select name="purpose" defaultValue="CUSTOMER">
          {purposes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-2xs text-red-800">{error}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy || !providers.length}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {labels.generate}
        </Button>
        {busy ? <span className="text-2xs text-muted">{labels.generating}</span> : null}
      </div>
    </form>
  );
}
