import { HardHat } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  return (
    <PortalPlaceholder
      icon={<HardHat />}
      title={t.portal.contractor.title}
      body={t.portal.contractor.body}
      tone="brand"
      homeHref={`/${locale}/workspace`}
      homeLabel={t.portal.goHome}
    />
  );
}
