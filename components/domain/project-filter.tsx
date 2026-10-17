"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/field";

/** Keeps a ?project= filter in the URL. */
export function ProjectFilter({
  projects,
  allLabel,
}: {
  projects: { id: string; label: string }[];
  allLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      aria-label={allLabel}
      className="w-56"
      value={params.get("project") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("project", e.target.value);
        else next.delete("project");
        router.push(`${pathname}${next.size ? `?${next}` : ""}`);
      }}
    >
      <option value="">{allLabel}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </Select>
  );
}
