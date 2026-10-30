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
        { label: t.nav.control, href: `${base}/control`, icon: "control" },
        { label: t.nav.market, href: `${base}/market`, icon: "market" },
        { label: t.nav.assistant, href: `${base}/assistant`, icon: "assistant" },
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
  sections.push({
    label: t.nav.account,
    items: [
      { label: t.nav.notifications, href: `${base}/notifications`, icon: "bell" },
      { label: t.nav.manual, href: `${base}/help`, icon: "manual" },
      {
        label: t.nav.notificationSettings,
        href: `${base}/settings/notifications`,
        icon: "setup",
      },
    ],
  });
  if (session.isInternal)
    sections[sections.length - 1].items.push({
      label: t.nav.standards,
      href: `${base}/settings/standards`,
      icon: "access",
    });
  const { count: unread } = await session.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
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
      notifications={{
        href: `${base}/notifications`,
        unread: unread ?? 0,
        label: t.nav.notifications,
      }}
      labels={{
        appName: t.app.name,
        project: t.nav.project,
        selectProject: t.nav.selectProject,
        allProjects: t.nav.allProjects,
        search: t.common.search,
        signOut: t.common.signOut,
        changePassword: t.password.title,
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
              plotHasUnits: t.flash.plotHasUnits,
              photosRequired: t.flash.photosRequired,
              hasSchedule: t.flash.hasSchedule,
              number: t.flash.number,
              pctRange: t.flash.pctRange,
              confirmCode: t.flash.confirmCode,
              unitDelete: t.flash.unitDelete,
              loginsOff: t.flash.loginsOff,
              passwordShort: t.flash.passwordShort,
              passwordWeak: t.flash.passwordWeak,
              createUser: t.flash.createUser,
              selfAccess: t.flash.selfAccess,
              partsTotal: t.flash.partsTotal,
              leasePartRequired: t.flash.leasePartRequired,
              leaseTerm: t.flash.leaseTerm,
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
              notAssigned: t.flash.notAssigned,
              selfVerifyFix: t.flash.selfVerifyFix,
              rfiClosed: t.flash.rfiClosed,
              wrongState: t.flash.wrongState,
              reportExists: t.flash.reportExists,
              voLocked: t.flash.voLocked,
              duplicateBankAccount: t.flash.duplicateBankAccount,
              invalidBankAccount: t.flash.invalidBankAccount,
              voState: t.flash.voState,
              selfApproveVo: t.flash.selfApproveVo,
              paymentCondition: t.flash.paymentCondition,
              drawingNotReleased: t.flash.drawingNotReleased,
              budgetLocked: t.flash.budgetLocked,
              selfApproveProc: t.flash.selfApproveProc,
              aboveLimit: t.flash.aboveLimit,
              procState: t.flash.procState,
              notComplete: t.flash.notComplete,
              criticalDefects: t.flash.criticalDefects,
              customerDefects: t.flash.customerDefects,
              itemsNotDelivered: t.flash.itemsNotDelivered,
              handoverFile: t.flash.handoverFile,
              handoverStep: t.flash.handoverStep,
              handoverDone: t.flash.handoverDone,
              notHandedOver: t.flash.notHandedOver,
              lineIdRequired: t.flash.lineIdRequired,
              referenceRequired: t.flash.referenceRequired,
              standardNotVerified: t.flash.standardNotVerified,
              standardDocRequired: t.flash.standardDocRequired,
              coordinate: t.flash.coordinate,
              no_zones: t.flash.no_zones,
              research_empty: t.flash.research_empty,
              ai_not_configured: t.flash.ai_not_configured,
              ai_no_photos: t.flash.ai_no_photos,
              ai_refusal: t.flash.ai_refusal,
              ai_auth: t.flash.ai_auth,
              ai_rate_limit: t.flash.ai_rate_limit,
              ai_generic: t.flash.ai_generic,
            },
          }}
        />
      </Suspense>
    </AppShell>
  );
}
