"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

const sections = [
  "schedule",
  "photos",
  "design",
  "studio",
  "site",
  "changes",
  "procurement",
  "handover",
  "setup",
  "finance",
] as const;

export function ProjectTabs({
  base,
  labels,
}: {
  base: string;
  labels: Record<"overview" | (typeof sections)[number], string>;
}) {
  const pathname = usePathname();
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  // The active tab is whichever section the path is in; anything else is the overview.
  const active = (sections as readonly string[]).includes(section) ? section : "overview";
  return (
    <Tabs
      active={active}
      items={[
        { key: "overview", label: labels.overview, href: base },
        ...sections.map((key) => ({ key, label: labels[key], href: `${base}/${key}` })),
      ]}
    />
  );
}
