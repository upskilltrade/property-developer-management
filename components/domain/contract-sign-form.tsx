"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, Hidden, Input } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Signed contract upload: the PDF goes straight to the private contract-files bucket, then the
 * server action records the signing with that object path only.
 */
export function ContractSignForm({
  action,
  hidden,
  folder,
  today,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  /** <org>/<project>/<unit>/<contract> */
  folder: string;
  today: string;
  labels: { hint: string; signedOn: string; file: string; submit: string; uploadFailed: string };
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");

  async function upload(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    setPath("");
    const objectPath = `${folder}/${crypto.randomUUID()}.pdf`;
    const { error } = await createClient()
      .storage.from("contract-files")
      .upload(objectPath, file, { contentType: "application/pdf" });
    if (error) {
      setState("error");
      return;
    }
    setName(file.name);
    setPath(objectPath);
    setState("idle");
  }

  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, file_path: path }} />
      <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{labels.hint}</p>
      <Field label={labels.signedOn} required>
        <Input name="signed_on" type="date" defaultValue={today} max={today} required />
      </Field>
      <Field label={labels.file} required>
        <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-line text-2xs text-muted hover:text-ink">
          {state === "uploading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileUp className="size-4" />
          )}
          <span className="max-w-60 truncate">
            {state === "error" ? labels.uploadFailed : name || labels.file}
          </span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </Field>
      <SheetFooter>
        <SubmitButton disabled={!path || state === "uploading"}>{labels.submit}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
