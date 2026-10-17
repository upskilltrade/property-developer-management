import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { loadSalesRefs } from "@/lib/sales-data";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet } from "@/components/ui/sheet";
import { LeadForm } from "@/components/domain/lead-form";
import { SalesTabs } from "@/components/domain/sales-tabs";
import { ProjectFilter } from "@/components/domain/project-filter";
import { createLead } from "./actions";

export default async function SalesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const { supabase } = await getSession(locale);
  const refs = await loadSalesRefs(supabase);
  const base = `/${locale}/app/sales`;

  return (
    <>
      <PageHeader
        title={t.sales.title}
        subtitle={t.sales.subtitle}
        crumbs={[{ label: t.nav.dashboard, href: `/${locale}/app` }, { label: t.nav.sales }]}
        actions={
          <>
            <Suspense>
              <ProjectFilter projects={refs.projects} allLabel={t.sales.allProjects} />
            </Suspense>
            <Sheet title={t.sales.newLead} triggerLabel={t.sales.newLead}>
              <LeadForm
                t={t}
                locale={locale}
                action={createLead}
                returnTo={`${base}/leads`}
                projects={refs.projects}
                units={refs.units.filter((u) => u.status === "AVAILABLE")}
                members={refs.members}
              />
            </Sheet>
          </>
        }
      />
      <div className="mb-4">
        <Suspense>
          <SalesTabs base={base} labels={t.sales.tabs} />
        </Suspense>
      </div>
      {children}
    </>
  );
}
