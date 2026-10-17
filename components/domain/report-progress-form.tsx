"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, RotateCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, FormGrid, Hidden, Input, Textarea } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";

type Labels = {
  percent: string;
  reportDate: string;
  note: string;
  photosLabel: string;
  addPhotos: string;
  uploading: string;
  uploadFailed: string;
  remove: string;
  caption: string;
  submitReport: string;
  hint: string;
};

type Item = {
  key: string;
  file: File;
  preview: string;
  status: "uploading" | "done" | "error";
  path?: string;
  thumb?: string;
  caption: string;
};

const MAX_SIDE = 2048;
const THUMB_SIDE = 400;
const MAX_BYTES = 10 * 1024 * 1024;

/** Downscales an image to a JPEG no larger than `side` px on its long edge. */
async function resize(file: File, side: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality),
  );
}

/**
 * Progress report with photo evidence. Photos are resized in the browser and uploaded one at a
 * time (weak site signal) straight to the private bucket; the server action then records the
 * report with the uploaded paths, and the database refuses it without the required photos.
 */
export function ReportProgressForm({
  action,
  hidden,
  folder,
  photosRequired,
  defaultPercent,
  defaultDate,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  /** <org>/<project>/<unit|project>/<activity> */
  folder: string;
  photosRequired: number;
  defaultPercent: number;
  defaultDate: string;
  labels: Labels;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef(Promise.resolve());

  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const upload = (item: Item) => {
    // Serialize uploads so a weak connection handles one file at a time.
    queue.current = queue.current.then(async () => {
      update(item.key, { status: "uploading" });
      try {
        const supabase = createClient();
        const id = crypto.randomUUID();
        const [full, thumb] = await Promise.all([
          resize(item.file, MAX_SIDE, 0.8),
          resize(item.file, THUMB_SIDE, 0.7),
        ]);
        const path = `${folder}/${id}.jpg`;
        const thumbPath = `${folder}/${id}_t.jpg`;
        for (const [p, blob] of [
          [path, full],
          [thumbPath, thumb],
        ] as const) {
          let attempt = 0;
          for (;;) {
            const { error } = await supabase.storage
              .from("site-photos")
              .upload(p, blob, { contentType: "image/jpeg", upsert: false });
            if (!error) break;
            if (++attempt >= 3) throw error;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
        update(item.key, { status: "done", path, thumb: thumbPath });
      } catch {
        update(item.key, { status: "error" });
      }
    });
  };

  const addFiles = (files: FileList | null) => {
    const next = Array.from(files ?? [])
      .filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES)
      .map<Item>((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        status: "uploading",
        caption: "",
      }));
    setItems((list) => [...list, ...next]);
    next.forEach(upload);
    if (input.current) input.current.value = "";
  };

  const done = items.filter((i) => i.status === "done");
  const busy = items.some((i) => i.status === "uploading");
  const ready = !busy && done.length >= photosRequired;
  const photos = done.map((i) => ({
    path: i.path,
    thumb: i.thumb,
    caption: i.caption,
    taken_at: new Date(i.file.lastModified).toISOString(),
  }));

  return (
    <form action={action} className="space-y-3">
      <Hidden values={{ ...hidden, photos: JSON.stringify(photos) }} />
      <p className="rounded-md bg-subtle px-3 py-2 text-2xs text-muted">{labels.hint}</p>
      <FormGrid>
        <Field label={labels.percent} required>
          <Input
            name="percent"
            type="number"
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            defaultValue={defaultPercent}
            required
          />
        </Field>
        <Field label={labels.reportDate}>
          <Input name="report_date" type="date" defaultValue={defaultDate} />
        </Field>
      </FormGrid>
      <Field label={labels.note}>
        <Textarea name="note" />
      </Field>

      <div className="space-y-2">
        <p className="text-2xs font-medium text-ink-2">
          {labels.photosLabel}
          {photosRequired ? <span className="ml-0.5 text-red-600">*</span> : null}
          <span className="ml-2 font-normal text-muted num">
            {done.length}/{Math.max(photosRequired, done.length)}
          </span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {items.map((i) => (
            <div key={i.key} className="space-y-1">
              <div className="relative aspect-square overflow-hidden rounded-md border border-line bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={i.preview} alt="" className="size-full object-cover" />
                {i.status === "uploading" ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                    <Loader2 className="size-5 animate-spin" aria-label={labels.uploading} />
                  </span>
                ) : null}
                {i.status === "error" ? (
                  <button
                    type="button"
                    onClick={() => upload(i)}
                    className="absolute inset-0 grid place-items-center bg-red-900/60 p-1 text-center text-[10px] text-white"
                  >
                    <RotateCw className="size-4" />
                    {labels.uploadFailed}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={labels.remove}
                  onClick={() => setItems((list) => list.filter((x) => x.key !== i.key))}
                  className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-3" />
                </button>
              </div>
              <input
                aria-label={labels.caption}
                placeholder={labels.caption}
                value={i.caption}
                onChange={(e) => update(i.key, { caption: e.target.value })}
                className="h-6 w-full rounded border border-line px-1.5 text-[11px]"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-2xs",
              done.length < photosRequired
                ? "border-brand/50 text-brand"
                : "border-line text-muted hover:text-ink",
            )}
          >
            <Camera className="size-5" />
            {labels.addPhotos}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      <SheetFooter>
        <SubmitButton disabled={!ready}>{labels.submitReport}</SubmitButton>
      </SheetFooter>
    </form>
  );
}
