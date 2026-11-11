"use client";

import { useState, type ReactNode } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, Hidden } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Marketing file upload: the file goes straight to the private marketing-files bucket under
 * `folder`, then the server action receives its path, original name, type and size together with
 * the other form fields. Any file type is accepted (CI packs, fonts, video), up to 50 MB.
 */
export function MarketingUploadForm({
  action,
  hidden,
  folder,
  labels,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  folder: string;
  labels: { file: string; submit: string; uploadFailed: string; tooLarge: string; hint: string };
  children?: ReactNode;
}) {
  const [file, setFile] = useState({ path: "", name: "", type: "", size: "" });
  const [state, setState] = useState<"idle" | "uploading" | "error" | "large">("idle");

  async function upload(f: File | undefined) {
    if (!f) return;
    setFile({ path: "", name: "", type: "", size: "" });
    if (f.size > MAX_BYTES) {
      setState("large");
      return;
    }
    setState("uploading");
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const objectPath = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient()
      .storage.from("marketing-files")
      .upload(objectPath, f, { contentType: f.type || "application/octet-stream" });
    if (error) {
      setState("error");
      return;
    }
    setFile({ path: objectPath, name: f.name, type: f.type, size: String(f.size) });
    setState("idle");
  }

  const message =
    state === "error"
      ? labels.uploadFailed
      : state === "large"
        ? labels.tooLarge
        : file.name || labels.file;

  return (
    <form action={action} className="space-y-3">
      <Hidden
        values={{
          ...hidden,
          file_path: file.path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }}
      />
      <Field label={labels.file} required hint={labels.hint}>
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line text-2xs text-muted hover:text-ink">
          {state === "uploading" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <FileUp className="size-5" />
          )}
          <span
            className={
              state === "error" || state === "large" ? "text-red-600" : "max-w-72 truncate"
            }
          >
            {message}
          </span>
          <input type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </Field>
      {children}
      <SheetFooter>
        <SubmitButton disabled={!file.path || state === "uploading"}>{labels.submit}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
