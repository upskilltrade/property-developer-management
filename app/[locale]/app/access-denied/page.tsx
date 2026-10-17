import { ShieldAlert } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  return (
    <PortalPlaceholder
      icon={<ShieldAlert />}
      title={t.portal.denied.title}
      body={t.portal.denied.body}
      tone="danger"
      homeHref={`/${locale}/workspace`}
      homeLabel={t.portal.goHome}
    />
  );
}
