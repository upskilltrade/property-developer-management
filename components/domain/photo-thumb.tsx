import { Globe } from "lucide-react";

/** Thumbnail from a short-lived signed URL; opens the full image in a new tab. */
export function PhotoThumb({
  thumb,
  full,
  caption,
  meta,
  published,
}: {
  thumb: string;
  full: string;
  caption?: string | null;
  meta?: string;
  published?: boolean;
}) {
  return (
    <figure className="min-w-0">
      <a
        href={full || undefined}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-square overflow-hidden rounded-md border border-line bg-subtle"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URLs expire; skip the image optimizer
          <img src={thumb} alt={caption ?? ""} loading="lazy" className="size-full object-cover" />
        ) : null}
        {published ? (
          <span className="absolute top-1 left-1 grid size-5 place-items-center rounded-full bg-emerald-600 text-white">
            <Globe className="size-3" />
          </span>
        ) : null}
      </a>
      {caption || meta ? (
        <figcaption className="mt-0.5 truncate text-[10px] text-muted">
          {caption}
          {caption && meta ? " · " : ""}
          {meta}
        </figcaption>
      ) : null}
    </figure>
  );
}
