"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

export function ProjectTabs({
  base,
  labels,
}: {
  base: string;
  labels: {
    overview: string;
    schedule: string;
    photos: string;
    design: string;
    site: string;
    setup: string;
    finance: string;
  };
}) {
  const pathname = usePathname();
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const active = ["schedule", "photos", "design", "site", "setup", "finance"].includes(section)
    ? section
    : "overview";
  return (
    <Tabs
      active={active}
      items={[
        { key: "overview", label: labels.overview, href: base },
        { key: "schedule", label: labels.schedule, href: `${base}/schedule` },
        { key: "photos", label: labels.photos, href: `${base}/photos` },
        { key: "design", label: labels.design, href: `${base}/design` },
        { key: "site", label: labels.site, href: `${base}/site` },
        { key: "setup", label: labels.setup, href: `${base}/setup` },
        { key: "finance", label: labels.finance, href: `${base}/finance` },
      ]}
    />
  );
}
