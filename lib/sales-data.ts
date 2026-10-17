import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Projects, units and members that sales forms and filters need. */
export async function loadSalesRefs(supabase: SupabaseClient) {
  const [{ data: projects }, { data: units }, { data: members }] = await Promise.all([
    supabase.from("projects").select("id,code,name").order("code"),
    supabase.from("units").select("id,code,project_id,status,list_price").order("code"),
    supabase
      .from("organization_memberships")
      .select("user_id,status,profiles:user_id(display_name)")
      .eq("status", "ACTIVE"),
  ]);
  const projectOptions = (projects ?? []).map((p) => ({
    id: p.id,
    label: `${p.code} · ${p.name}`,
    code: p.code,
  }));
  const unitOptions = (units ?? []).map((u) => ({
    id: u.id,
    label: u.code,
    project_id: u.project_id,
    status: u.status as string,
    list_price: u.list_price as number | null,
  }));
  const memberOptions = (members ?? []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      id: m.user_id as string,
      label: (p as { display_name?: string } | null)?.display_name ?? m.user_id.slice(0, 8),
    };
  });
  return { projects: projectOptions, units: unitOptions, members: memberOptions };
}
