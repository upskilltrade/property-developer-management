import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/page-header";
import { AssistantChat } from "@/components/domain/assistant-chat";

export const metadata: Metadata = { title: "AI assistant" };

export default async function Assistant({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { isInternal } = await getSession(locale);
  if (!isInternal) redirect(`/${locale}/app/access-denied`);
  const a = t.assistant;
  return (
    <>
      <PageHeader title={a.title} subtitle={a.subtitle} />
      <AssistantChat
        locale={locale}
        configured={Boolean(process.env.ANTHROPIC_API_KEY)}
        labels={{
          placeholder: a.placeholder,
          send: a.send,
          clear: a.clear,
          working: a.working,
          disclaimer: a.disclaimer,
          examples: a.examples,
          tools: a.tools,
          errors: a.errors,
          truncated: a.truncated,
        }}
      />
    </>
  );
}
