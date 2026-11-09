"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Hidden } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

type Labels = { takePhoto: string; choosePhotos: string; uploading: string; uploadFailed: string };

type Item = {
  key: string;
  file: File;
  preview: string;
  status: "uploading" | "done" | "error";
  path?: string;
  thumb?: string;
};

const MAX_SIDE = 2048;
const THUMB_SIDE = 400;
const MAX_BYTES = 25 * 1024 * 1024;

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
 * Two buttons: take a photo with the camera (phone) or pick several files (phone gallery or
 * computer). Each photo is resized in the browser, uploaded to design-files/<folder>/, and once
 * every upload has finished the form submits itself so the photos are recorded with no extra tap.
 */
export function SpecPhotoUpload({
  action,
  hidden,
  folder,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string | null | undefined>;
  /** <org>/<project>/spec */
  folder: string;
  labels: Labels;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const queue = useRef(Promise.resolve());
  const submitted = useRef(false);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const upload = (item: Item) => {
    // One file at a time so a weak phone signal is not split across uploads.
    queue.current = queue.current.then(async () => {
      update(item.key, { status: "uploading" });
      try {
        const supabase = createClient();
        const id = crypto.randomUUID();
        const [full, thumb] = await Promise.all([
          resize(item.file, MAX_SIDE, 0.82),
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
              .from("design-files")
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

  const addFiles = (input: HTMLInputElement | null) => {
    const next = Array.from(input?.files ?? [])
      .filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES)
      .slice(0, 30)
      .map<Item>((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        status: "uploading",
      }));
    submitted.current = false;
    setItems((list) => [...list, ...next]);
    next.forEach(upload);
    if (input) input.value = "";
  };

  const done = items.filter((i) => i.status === "done");
  const busy = items.some((i) => i.status === "uploading");
  const failed = items.some((i) => i.status === "error");

  useEffect(() => {
    if (submitted.current || busy || failed || !done.length) return;
    submitted.current = true;
    form.current?.requestSubmit();
  }, [busy, failed, done.length]);

  return (
    <form ref={form} action={action} className="space-y-2">
      <Hidden
        values={{
          ...hidden,
          photos: JSON.stringify(done.map((i) => ({ path: i.path, thumb_path: i.thumb }))),
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => camera.current?.click()}
          className={buttonClass("primary", "md")}
        >
          <Camera />
          {labels.takePhoto}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => picker.current?.click()}
          className={buttonClass("secondary", "md")}
        >
          <ImagePlus />
          {labels.choosePhotos}
        </button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.currentTarget)}
      />
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.currentTarget)}
      />
      {items.length ? (
        <div className="grid grid-cols-4 gap-2">
          {items.map((i) => (
            <div
              key={i.key}
              className="relative aspect-square overflow-hidden rounded-md border border-line bg-subtle"
            >
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
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
