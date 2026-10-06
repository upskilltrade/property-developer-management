import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const routeByRole: Record<string,string> = {
  OWNER: "",
  INVESTOR: "/investor",
  PROJECT_MANAGER: "/work",
  FINANCE_MANAGER: "/work",
  ACCOUNTANT: "/work",
  QS_COST_CONTROL: "/work",
  SITE_ENGINEER: "/work",
  PROCUREMENT: "/work",
  SALES: "/work",
  CRM: "/work",
  CONTRACTOR: "/contractor",
  CUSTOMER: "/customer",
};

export default async function WorkspaceEntry({params}:{params:Promise<{locale:string}>}) {
  const {locale:raw}=await params;
  const locale=raw==="en"?"en":"th";
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect(`/${locale}/login`);
  const {data}=await supabase.from("organization_memberships")
    .select("id,membership_roles(role:roles(code))")
    .eq("user_id",user.id).eq("status","ACTIVE");
  const codes=(data??[]).flatMap((m:any)=>(m.membership_roles??[]).map((x:any)=>x.role?.code).filter(Boolean));
  const priority=["OWNER","INVESTOR","PROJECT_MANAGER","FINANCE_MANAGER","ACCOUNTANT","QS_COST_CONTROL","SITE_ENGINEER","PROCUREMENT","SALES","CRM","CONTRACTOR","CUSTOMER"];
  const role=priority.find(code=>codes.includes(code));
  if(!role) redirect(`/${locale}/app/access-pending`);
  redirect(`/${locale}/app${routeByRole[role]}`);
}
