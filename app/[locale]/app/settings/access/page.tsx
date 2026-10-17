import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, Hidden, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { assignAccess } from "./actions";

export const metadata: Metadata = { title: "User access" };

type Grant = {
  scope_type: string;
  scope_id: string | null;
  role: { code: string; name_th: string; name_en: string } | null;
};

export default async function AccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase, ownerOrganizationId: org } = await getSession(locale);
  if (!org) redirect(`/${locale}/app/access-denied`);

  const [{ data: members }, { data: roles }, { data: projects }] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select(
        "id,user_id,status,profiles:user_id(display_name),membership_roles(scope_type,scope_id,role:roles(code,name_th,name_en))",
      )
      .eq("organization_id", org),
    supabase
      .from("roles")
      .select("id,code,name_th,name_en")
      .eq("organization_id", org)
      .order("code"),
    supabase.from("projects").select("id,name,code").eq("organization_id", org).order("code"),
  ]);
  const projectCode = new Map((projects ?? []).map((p) => [p.id, p.code]));
  const roleName = (r: { code: string; name_th: string; name_en: string }) =>
    (locale === "th" ? r.name_th : r.name_en) || r.code;
  const memberName = (m: { user_id: string; profiles: unknown }) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return (p as { display_name?: string } | null)?.display_name || m.user_id.slice(0, 8);
  };

  return (
    <>
      <PageHeader
        title={t.access.title}
        subtitle={t.access.subtitle}
        crumbs={[{ label: t.nav.dashboard, href: `/${locale}/app` }, { label: t.access.title }]}
        actions={
          <Sheet title={t.access.assign} triggerLabel={t.access.assign} triggerIcon={<UserPlus />}>
            <form action={assignAccess} className="space-y-3">
              <Hidden values={{ locale }} />
              <Field label={t.access.member} required>
                <Select name="membership_id" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {(members ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberName(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.access.role} required>
                <Select name="role_id" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {roleName(r)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.access.scope}>
                <Select name="scope_type" defaultValue="PROJECT">
                  <option value="PROJECT">{t.access.scopeProject}</option>
                  <option value="ORGANIZATION">{t.access.scopeOrg}</option>
                </Select>
              </Field>
              <Field label={t.finance.fields.project} hint={t.access.scopeProject}>
                <Select name="scope_id" defaultValue="">
                  <option value="">—</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <SheetFooter>
                <SubmitButton>{t.common.save}</SubmitButton>
              </SheetFooter>
            </form>
          </Sheet>
        }
      />
      <Panel
        title={t.access.members}
        actions={<span className="text-2xs text-muted num">{members?.length ?? 0}</span>}
      >
        {members?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>{t.access.member}</TH>
                <TH>{t.common.status}</TH>
                <TH>{t.access.currentRoles}</TH>
              </tr>
            </THead>
            <tbody>
              {members.map((m) => {
                const grants = (m.membership_roles ?? []) as unknown as Grant[];
                return (
                  <TR key={m.id}>
                    <TD>
                      <p className="font-medium">{memberName(m)}</p>
                      <p className="font-mono text-[10px] text-faint">{m.user_id}</p>
                    </TD>
                    <TD>
                      <Badge tone={m.status === "ACTIVE" ? "success" : "neutral"}>
                        {label(t.status.membership, m.status)}
                      </Badge>
                    </TD>
                    <TD className="whitespace-normal">
                      {grants.length ? (
                        <div className="flex flex-wrap gap-1">
                          {grants.map((g, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded border border-line bg-subtle px-1.5 py-0.5 text-2xs"
                            >
                              <span className="font-semibold">
                                {g.role ? roleName(g.role) : "?"}
                              </span>
                              <span className="text-muted">
                                ·{" "}
                                {g.scope_type === "ORGANIZATION"
                                  ? t.access.scopeOrg
                                  : (projectCode.get(g.scope_id ?? "") ?? g.scope_id)}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-2xs text-faint">{t.access.noRoles}</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Users />} title={t.access.noMembers} />
        )}
      </Panel>
    </>
  );
}
