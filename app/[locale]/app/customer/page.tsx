import { Home } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  return (
    <PortalPlaceholder
      icon={<Home />}
      title={t.portal.customer.title}
      body={t.portal.customer.body}
      tone="brand"
      homeHref={`/${locale}/workspace`}
      homeLabel={t.portal.goHome}
    />
  );
}
