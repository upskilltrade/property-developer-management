import { Clock } from "lucide-react";
import { resolveLocale } from "@/lib/i18n";
import { PortalPlaceholder } from "@/components/domain/portal-placeholder";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { t } = await resolveLocale(params);
  return (
    <PortalPlaceholder
      icon={<Clock />}
      title={t.portal.pending.title}
      body={t.portal.pending.body}
      tone="warning"
    />
  );
}
