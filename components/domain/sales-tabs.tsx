"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

/** Sales section tabs; keeps the ?project= filter when switching tabs. */
export function SalesTabs({
  base,
  labels,
}: {
  base: string;
  labels: {
    pipeline: string;
    leads: string;
    inventory: string;
    bookings: string;
    contracts: string;
    customers: string;
  };
}) {
  const pathname = usePathname();
  const project = useSearchParams().get("project");
  const q = project ? `?project=${project}` : "";
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const active = ["leads", "inventory", "bookings", "contracts", "customers"].includes(section)
    ? section
    : "pipeline";
  return (
    <Tabs
      active={active}
      items={[
        { key: "pipeline", label: labels.pipeline, href: `${base}${q}` },
        { key: "leads", label: labels.leads, href: `${base}/leads${q}` },
        { key: "inventory", label: labels.inventory, href: `${base}/inventory${q}` },
        { key: "bookings", label: labels.bookings, href: `${base}/bookings${q}` },
        { key: "contracts", label: labels.contracts, href: `${base}/contracts${q}` },
        { key: "customers", label: labels.customers, href: `${base}/customers` },
      ]}
    />
  );
}
