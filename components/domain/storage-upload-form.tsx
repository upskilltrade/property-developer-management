"use client";

import { useState, type ReactNode } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, Hidden } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Generic private-bucket upload: the file goes straight to Storage under `folder`, then the server
 * action receives only the object path (file_path) together with the other form fields.
 * With `optional`, the form can be sent without a file (file_path is then empty).
 */
export function StorageUploadForm({
  action,
  hidden,
  bucket,
  folder,
  accept,
  labels,
  optional = false,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  bucket: string;
  folder: string;
  accept: string;
  labels: { file: string; submit: string; uploadFailed: string; hint?: string };
  optional?: boolean;
  children?: ReactNode;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");

  async function upload(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    setPath("");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const objectPath = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient()
      .storage.from(bucket)
      .upload(objectPath, file, { contentType: file.type || undefined });
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
      {labels.hint ? (
        <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{labels.hint}</p>
      ) : null}
      <Field label={labels.file} required={!optional}>
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
            accept={accept}
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </Field>
      {children}
      <SheetFooter>
        <SubmitButton disabled={(!optional && !path) || state === "uploading"}>
          {labels.submit}
        </SubmitButton>
      </SheetFooter>
    </form>
  );
}
