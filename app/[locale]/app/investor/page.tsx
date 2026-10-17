import { PieChart } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  return (
    <PortalPlaceholder
      icon={<PieChart />}
      title={t.portal.investor.title}
      body={t.portal.investor.body}
      tone="brand"
      homeHref={`/${locale}/workspace`}
      homeLabel={t.portal.goHome}
    />
  );
}
