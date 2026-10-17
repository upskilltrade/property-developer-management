import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck, ShieldPlus, UserPlus, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { resolveLocale } from "@/lib/i18n";
import { label } from "@/lib/i18n/label";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetFooter } from "@/components/ui/sheet";
import { Field, FormGrid, Hidden, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { assignAccess, createRole, setOverride } from "./actions";

export const metadata: Metadata = { title: "User access" };

type Grant = {
  scope_type: string;
  scope_id: string | null;
  role: { code: string; name_th: string; name_en: string } | null;
};

type CatalogEntry = {
  id: string;
  module_code: string;
  action_code: string;
  name_th: string;
  name_en: string;
};

export default async function AccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await resolveLocale(params);
  const { supabase, ownerOrganizationId: org } = await getSession(locale);
  if (!org) redirect(`/${locale}/app/access-denied`);

  const [{ data: members }, { data: roles }, { data: projects }, { data: catalogRows }] =
    await Promise.all([
      supabase
        .from("organization_memberships")
        .select(
          "id,user_id,status,profiles:user_id(display_name),membership_roles(scope_type,scope_id,role:roles(code,name_th,name_en))",
        )
        .eq("organization_id", org),
      supabase
        .from("roles")
        .select("id,code,name_th,name_en,is_system")
        .eq("organization_id", org)
        .order("code"),
      supabase.from("projects").select("id,name,code").eq("organization_id", org).order("code"),
      supabase
        .from("permission_catalog")
        .select("id,module_code,action_code,name_th,name_en")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
  const memberIds = (members ?? []).map((m) => m.id);
  const roleIds = (roles ?? []).map((r) => r.id);
  const [{ data: overrides }, { data: rolePermissions }] = await Promise.all([
    memberIds.length
      ? supabase
          .from("membership_permission_overrides")
          .select("id,membership_id,module_code,action_code,effect,scope_type,scope_id")
          .in("membership_id", memberIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    roleIds.length
      ? supabase.from("role_permissions").select("role_id").in("role_id", roleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const a = t.access;
  const catalog = (catalogRows ?? []) as CatalogEntry[];
  const modules = [...new Set(catalog.map((c) => c.module_code))];
  const permissionName = (c: CatalogEntry) =>
    (locale === "th" ? c.name_th : c.name_en) || c.action_code;
  const permissionCount = new Map<string, number>();
  for (const p of rolePermissions ?? [])
    permissionCount.set(p.role_id, (permissionCount.get(p.role_id) ?? 0) + 1);
  const projectCode = new Map((projects ?? []).map((p) => [p.id, p.code]));
  const scopeLabel = (type: string, scopeId: string | null) =>
    type === "ORGANIZATION" ? a.scopeOrg : (projectCode.get(scopeId ?? "") ?? scopeId);
  const roleName = (r: { code: string; name_th: string; name_en: string }) =>
    (locale === "th" ? r.name_th : r.name_en) || r.code;
  const memberName = (m: { user_id: string; profiles: unknown }) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return (p as { display_name?: string } | null)?.display_name || m.user_id.slice(0, 8);
  };
  const memberById = new Map((members ?? []).map((m) => [m.id, memberName(m)]));

  const memberSelect = (
    <Field label={a.member} required>
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
  );
  const scopeFields = (
    <FormGrid>
      <Field label={a.scope}>
        <Select name="scope_type" defaultValue="PROJECT">
          <option value="PROJECT">{a.scopeProject}</option>
          <option value="ORGANIZATION">{a.scopeOrg}</option>
        </Select>
      </Field>
      <Field label={t.finance.fields.project} hint={a.projectHint}>
        <Select name="scope_id" defaultValue="">
          <option value="">—</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </Select>
      </Field>
    </FormGrid>
  );

  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={a.subtitle}
        crumbs={[{ label: t.nav.dashboard, href: `/${locale}/app` }, { label: a.title }]}
        actions={
          <>
            <Sheet
              title={a.newRole}
              description={a.newRoleHint}
              triggerLabel={a.newRole}
              triggerIcon={<ShieldPlus />}
              triggerVariant="secondary"
              width="lg"
            >
              <form action={createRole} className="space-y-3">
                <Hidden values={{ locale }} />
                <FormGrid cols={3}>
                  <Field label={a.roleCode} hint={a.roleCodeHint} required>
                    <Input name="code" placeholder="SITE_LEAD" required />
                  </Field>
                  <Field label={a.nameTh} required>
                    <Input name="name_th" required />
                  </Field>
                  <Field label={a.nameEn} required>
                    <Input name="name_en" required />
                  </Field>
                </FormGrid>
                <Field label={t.common.description}>
                  <Textarea name="description" />
                </Field>
                <div className="space-y-2">
                  <p className="text-2xs font-medium text-ink-2">{a.permissions}</p>
                  {modules.length ? (
                    <div className="divide-y divide-line rounded-md border border-line">
                      {modules.map((mod) => (
                        <div key={mod} className="grid gap-2 px-3 py-2 sm:grid-cols-[9rem_1fr]">
                          <span className="font-mono text-2xs font-semibold">{mod}</span>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {catalog
                              .filter((c) => c.module_code === mod)
                              .map((c) => (
                                <label
                                  key={c.id}
                                  className="inline-flex items-center gap-1.5 text-[13px]"
                                >
                                  <input
                                    type="checkbox"
                                    name="permission"
                                    value={`${c.module_code}:${c.action_code}`}
                                    className="size-3.5 accent-brand"
                                  />
                                  {permissionName(c)}
                                </label>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-muted">{a.noCatalog}</p>
                  )}
                </div>
                <SheetFooter>
                  <SubmitButton>{t.common.create}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
            <Sheet title={a.assign} triggerLabel={a.assign} triggerIcon={<UserPlus />}>
              <form action={assignAccess} className="space-y-3">
                <Hidden values={{ locale }} />
                {memberSelect}
                <Field label={a.role} required>
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
                {scopeFields}
                <SheetFooter>
                  <SubmitButton>{t.common.save}</SubmitButton>
                </SheetFooter>
              </form>
            </Sheet>
          </>
        }
      />
      <div className="space-y-4">
        <Panel
          title={a.members}
          actions={<span className="text-2xs text-muted num">{members?.length ?? 0}</span>}
        >
          {members?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>{a.member}</TH>
                  <TH>{t.common.status}</TH>
                  <TH>{a.currentRoles}</TH>
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
                                  · {scopeLabel(g.scope_type, g.scope_id)}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-2xs text-faint">{a.noRoles}</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Users />} title={a.noMembers} />
          )}
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title={a.roles}
            description={a.rolesHint}
            actions={<span className="text-2xs text-muted num">{roles?.length ?? 0}</span>}
          >
            {roles?.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{t.common.code}</TH>
                    <TH>{t.common.name}</TH>
                    <TH>{a.roleKind}</TH>
                    <TH align="right">{a.permissions}</TH>
                  </tr>
                </THead>
                <tbody>
                  {roles.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono text-2xs">{r.code}</TD>
                      <TD className="font-medium">{roleName(r)}</TD>
                      <TD>
                        <Badge tone={r.is_system ? "neutral" : "accent"}>
                          {r.is_system ? a.systemRole : a.customRole}
                        </Badge>
                      </TD>
                      <TD align="right" className="num">
                        {permissionCount.get(r.id) ?? 0}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<ShieldCheck />} title={a.noRoles} />
            )}
          </Panel>

          <Panel
            title={a.overrides}
            description={a.overridesHint}
            actions={
              <Sheet
                title={a.addOverride}
                description={a.overridesHint}
                triggerLabel={a.addOverride}
                triggerIcon={<KeyRound />}
                triggerVariant="secondary"
                triggerSize="xs"
              >
                <form action={setOverride} className="space-y-3">
                  <Hidden values={{ locale }} />
                  {memberSelect}
                  <Field label={a.permission} required>
                    <Select name="permission" required defaultValue="">
                      <option value="" disabled>
                        —
                      </option>
                      {modules.map((mod) => (
                        <optgroup key={mod} label={mod}>
                          {catalog
                            .filter((c) => c.module_code === mod)
                            .map((c) => (
                              <option key={c.id} value={`${c.module_code}:${c.action_code}`}>
                                {c.module_code}.{c.action_code} · {permissionName(c)}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>
                  <Field label={a.effect}>
                    <Select name="effect" defaultValue="ALLOW">
                      <option value="ALLOW">{a.effectAllow}</option>
                      <option value="DENY">{a.effectDeny}</option>
                    </Select>
                  </Field>
                  {scopeFields}
                  <SheetFooter>
                    <SubmitButton>{t.common.save}</SubmitButton>
                  </SheetFooter>
                </form>
              </Sheet>
            }
          >
            {overrides?.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>{a.member}</TH>
                    <TH>{a.permission}</TH>
                    <TH>{a.effect}</TH>
                    <TH>{a.scope}</TH>
                  </tr>
                </THead>
                <tbody>
                  {overrides.map((o) => (
                    <TR key={o.id}>
                      <TD className="font-medium">{memberById.get(o.membership_id) ?? "—"}</TD>
                      <TD className="font-mono text-2xs">
                        {o.module_code}.{o.action_code}
                      </TD>
                      <TD>
                        <Badge tone={o.effect === "DENY" ? "danger" : "success"}>
                          {o.effect === "DENY" ? a.effectDeny : a.effectAllow}
                        </Badge>
                      </TD>
                      <TD className="text-muted">{scopeLabel(o.scope_type, o.scope_id)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<KeyRound />} title={a.noOverrides} />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
