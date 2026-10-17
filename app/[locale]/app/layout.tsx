import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { AppShell, type NavSection } from "@/components/shell/app-shell";
import { Flash } from "@/components/ui/flash";
import { logout } from "../login/actions";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale, t } = await resolveLocale(params);
  const session = await getSession(locale);
  const base = `/${locale}/app`;

  const { data: projects } = session.isInternal
    ? await session.supabase.from("projects").select("id,code,name").order("code")
    : { data: [] };

  const sections: NavSection[] = [];
  if (session.isInternal) {
    sections.push({
      label: t.nav.main,
      items: [
        { label: t.nav.dashboard, href: base, icon: "dashboard", exact: true },
        { label: t.nav.projects, href: `${base}/projects`, icon: "projects", exact: true },
        { label: t.nav.sales, href: `${base}/sales`, icon: "sales" },
        { label: t.nav.finance, href: `${base}/finance`, icon: "finance" },
      ],
    });
  }
  const portals: NavSection["items"] = [];
  if (session.roles.has("INVESTOR"))
    portals.push({ label: t.portal.investor.title, href: `${base}/investor`, icon: "investor" });
  if (session.roles.has("CONTRACTOR"))
    portals.push({
      label: t.portal.contractor.title,
      href: `${base}/contractor`,
      icon: "contractor",
    });
  if (session.roles.has("CUSTOMER"))
    portals.push({ label: t.portal.customer.title, href: `${base}/customer`, icon: "customer" });
  if (portals.length) sections.push({ label: t.nav.main, items: portals });
  if (session.ownerOrganizationId) {
    sections.push({
      label: t.nav.admin,
      items: [{ label: t.nav.access, href: `${base}/settings/access`, icon: "access" }],
    });
  }

  return (
    <AppShell
      locale={locale}
      sections={sections}
      projects={projects ?? []}
      user={{
        name: session.displayName,
        email: session.user.email ?? "",
        roles: [...session.roles],
      }}
      signOut={logout}
      labels={{
        appName: t.app.name,
        project: t.nav.project,
        selectProject: t.nav.selectProject,
        allProjects: t.nav.allProjects,
        search: t.common.search,
        signOut: t.common.signOut,
        language: t.common.language,
        overview: t.nav.overview,
        setup: t.nav.setup,
        projectFinance: t.nav.projectFinance,
      }}
    >
      {children}
      <Suspense>
        <Flash
          messages={{
            saved: t.flash.saved,
            error: t.flash.error,
            invalid: t.flash.invalid,
            permission: t.flash.permission,
            errors: {
              selfVerify: t.flash.selfVerify,
              photosRequired: t.flash.photosRequired,
              hasSchedule: t.flash.hasSchedule,
              noAccount: t.flash.noAccount,
              noCustomerForSchedule: t.flash.noCustomerForSchedule,
              scheduleHasPayments: t.flash.scheduleHasPayments,
              selfVerifyPayment: t.flash.selfVerifyPayment,
              evidenceRequired: t.flash.evidenceRequired,
              unitUnavailable: t.flash.unitUnavailable,
              discountReason: t.flash.discountReason,
              leadClosed: t.flash.leadClosed,
              selfApprove: t.flash.selfApprove,
              bookingHasPayments: t.flash.bookingHasPayments,
              contactRequired: t.flash.contactRequired,
              bookingHasContract: t.flash.bookingHasContract,
              priceBelowApproved: t.flash.priceBelowApproved,
              changeNote: t.flash.changeNote,
              contractLocked: t.flash.contractLocked,
              contractFile: t.flash.contractFile,
              designFile: t.flash.designFile,
              openRevision: t.flash.openRevision,
              selfReview: t.flash.selfReview,
              revisionState: t.flash.revisionState,
              commentRequired: t.flash.commentRequired,
            },
          }}
        />
      </Suspense>
    </AppShell>
  );
}
