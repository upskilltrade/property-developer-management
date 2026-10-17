import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { toLocale } from "@/lib/i18n/config";

/** Landing route after sign-in: sends each user to the workspace for their highest-priority role. */
const routeByRole: [string, string][] = [
  ["OWNER", ""],
  ["INVESTOR", "/investor"],
  ["PROJECT_MANAGER", ""],
  ["FINANCE_MANAGER", "/finance"],
  ["ACCOUNTANT", "/finance"],
  ["QS_COST_CONTROL", "/projects"],
  ["SITE_ENGINEER", "/projects"],
  ["PROCUREMENT", "/projects"],
  ["SALES", "/projects"],
  ["CRM", "/projects"],
  ["CONTRACTOR", "/contractor"],
  ["CUSTOMER", "/customer"],
];

export default async function WorkspaceEntry({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  const { roles } = await getSession(locale);
  const match = routeByRole.find(([role]) => roles.has(role));
  if (!match) redirect(`/${locale}/app/access-pending`);
  redirect(`/${locale}/app${match[1]}`);
}
