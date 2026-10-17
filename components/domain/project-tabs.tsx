"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

export function ProjectTabs({
  base,
  labels,
}: {
  base: string;
  labels: { overview: string; setup: string; finance: string };
}) {
  const pathname = usePathname();
  const active = pathname.startsWith(`${base}/setup`)
    ? "setup"
    : pathname.startsWith(`${base}/finance`)
      ? "finance"
      : "overview";
  return (
    <Tabs
      active={active}
      items={[
        { key: "overview", label: labels.overview, href: base },
        { key: "setup", label: labels.setup, href: `${base}/setup` },
        { key: "finance", label: labels.finance, href: `${base}/finance` },
      ]}
    />
  );
}
