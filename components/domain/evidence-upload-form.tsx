"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { paymentMethods } from "@/lib/payments";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Payment slip upload: the file goes straight to the private payment-evidence bucket (images are
 * downscaled first), then the server action records the evidence with that object path only.
 */
export function EvidenceUploadForm({
  action,
  hidden,
  folder,
  defaultAmount,
  defaultDate,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  /** <org>/<project>/<unit>/<schedule> */
  folder: string;
  defaultAmount: number;
  defaultDate: string;
  labels: {
    hint: string;
    amount: string;
    paidOn: string;
    method: string;
    reference: string;
    note: string;
    file: string;
    submit: string;
    uploadFailed: string;
    methods: Record<string, string>;
  };
}) {
  const [path, setPath] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");

  async function upload(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    setPath("");
    try {
      let blob: Blob = file;
      let ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise<Blob>((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85),
        );
        ext = "jpg";
      }
      const objectPath = `${folder}/${crypto.randomUUID()}.${ext === "pdf" ? "pdf" : "jpg"}`;
      const { error } = await createClient()
        .storage.from("payment-evidence")
        .upload(objectPath, blob, {
          contentType: ext === "pdf" ? "application/pdf" : "image/jpeg",
        });
      if (error) throw error;
      setPath(objectPath);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, file_path: path }} />
      <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{labels.hint}</p>
      <FormGrid>
        <Field label={labels.amount} required>
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={defaultAmount || ""}
            required
          />
        </Field>
        <Field label={labels.paidOn} required>
          <Input name="paid_on" type="date" defaultValue={defaultDate} max={defaultDate} required />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={labels.method}>
          <Select name="method" defaultValue="TRANSFER">
            {paymentMethods.map((m) => (
              <option key={m} value={m}>
                {labels.methods[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={labels.reference}>
          <Input name="reference" />
        </Field>
      </FormGrid>
      <Field label={labels.file} required>
        <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-line text-2xs text-muted hover:text-ink">
          {state === "uploading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileUp className="size-4" />
          )}
          <span className="max-w-60 truncate">
            {state === "error" ? labels.uploadFailed : path ? path.split("/").pop() : labels.file}
          </span>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </Field>
      <Field label={labels.note}>
        <Textarea name="note" />
      </Field>
      <SheetFooter>
        <SubmitButton disabled={!path || state === "uploading"}>{labels.submit}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
