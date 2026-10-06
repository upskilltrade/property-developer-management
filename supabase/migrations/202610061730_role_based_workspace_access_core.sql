-- Role-based workspace access core
create table if not exists public.role_permissions (
 id uuid primary key default gen_random_uuid(), role_id uuid not null references public.roles(id) on delete cascade,
 module_code text not null, action_code text not null, created_at timestamptz not null default now(),
 unique(role_id,module_code,action_code)
);
alter table public.role_permissions enable row level security;
create policy "role permissions visible to org members" on public.role_permissions for select to authenticated using (
 exists(select 1 from public.roles r where r.id=role_id and public.is_org_member(r.organization_id))
);
create policy "role permissions managed by org managers" on public.role_permissions for all to authenticated using (
 exists(select 1 from public.roles r where r.id=role_id and public.can_manage_organization(r.organization_id))
) with check (exists(select 1 from public.roles r where r.id=role_id and public.can_manage_organization(r.organization_id)));
create index if not exists idx_role_permissions_role on public.role_permissions(role_id);
create index if not exists idx_membership_roles_scope on public.membership_roles(membership_id,scope_type,scope_id);
insert into public.roles(organization_id,code,name_th,name_en,is_system)
select o.id,v.code,v.th,v.en,true from public.organizations o cross join (values
 ('OWNER','เจ้าของ / ผู้พัฒนา','Owner / Developer'),('INVESTOR','ผู้ลงทุน','Investor'),('PROJECT_MANAGER','ผู้จัดการโครงการ','Project Manager'),('FINANCE_MANAGER','ผู้จัดการการเงิน','Finance Manager'),('ACCOUNTANT','บัญชี','Accountant'),('QS_COST_CONTROL','QS / ควบคุมต้นทุน','QS / Cost Control'),('SITE_ENGINEER','วิศวกรสนาม','Site Engineer'),('PROCUREMENT','จัดซื้อ','Procurement'),('SALES','ฝ่ายขาย','Sales'),('CRM','ลูกค้าสัมพันธ์','CRM'),('CONTRACTOR','ผู้รับเหมา','Contractor'),('CUSTOMER','ลูกค้า / เจ้าของบ้าน','Customer')
) v(code,th,en) where not exists(select 1 from public.roles r where r.organization_id=o.id and r.code=v.code);
with matrix(role_code,module_code,action_code) as (values
 ('OWNER','PORTFOLIO','VIEW'),('OWNER','PROJECTS','VIEW'),('OWNER','FINANCE','VIEW'),('OWNER','FINANCE','APPROVE'),('OWNER','CONSTRUCTION','VIEW'),('OWNER','SALES','VIEW'),('OWNER','REPORTS','VIEW'),('INVESTOR','INVESTOR','VIEW'),('INVESTOR','REPORTS','VIEW'),('PROJECT_MANAGER','PROJECTS','VIEW'),('PROJECT_MANAGER','CONSTRUCTION','VIEW'),('PROJECT_MANAGER','CONSTRUCTION','APPROVE'),('PROJECT_MANAGER','PROCUREMENT','APPROVE'),('PROJECT_MANAGER','COST_CONTROL','VIEW'),('FINANCE_MANAGER','FINANCE','VIEW'),('FINANCE_MANAGER','FINANCE','CREATE'),('FINANCE_MANAGER','FINANCE','APPROVE'),('FINANCE_MANAGER','FINANCE','POST'),('FINANCE_MANAGER','REPORTS','VIEW'),('ACCOUNTANT','FINANCE','VIEW'),('ACCOUNTANT','FINANCE','CREATE'),('ACCOUNTANT','FINANCE','POST'),('ACCOUNTANT','TAX','VIEW'),('QS_COST_CONTROL','COST_CONTROL','VIEW'),('QS_COST_CONTROL','COST_CONTROL','EDIT'),('QS_COST_CONTROL','PROCUREMENT','VIEW'),('SITE_ENGINEER','CONSTRUCTION','VIEW'),('SITE_ENGINEER','CONSTRUCTION','EDIT'),('PROCUREMENT','PROCUREMENT','VIEW'),('PROCUREMENT','PROCUREMENT','CREATE'),('PROCUREMENT','PROCUREMENT','EDIT'),('SALES','SALES','VIEW'),('SALES','SALES','EDIT'),('SALES','CUSTOMERS','VIEW'),('CRM','CUSTOMERS','VIEW'),('CRM','CUSTOMERS','EDIT'),('CRM','SALES','VIEW'),('CONTRACTOR','CONTRACTOR_PORTAL','VIEW'),('CONTRACTOR','CLAIMS','CREATE'),('CUSTOMER','CUSTOMER_PORTAL','VIEW'),('CUSTOMER','SERVICE_REQUEST','CREATE'))
insert into public.role_permissions(role_id,module_code,action_code) select r.id,m.module_code,m.action_code from matrix m join public.roles r on r.code=m.role_code on conflict(role_id,module_code,action_code) do nothing;
create or replace function public.has_permission(target_org uuid,target_project uuid,target_module text,target_action text) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.organization_memberships om join public.membership_roles mr on mr.membership_id=om.id join public.role_permissions rp on rp.role_id=mr.role_id where om.user_id=auth.uid() and om.organization_id=target_org and om.status='ACTIVE' and rp.module_code=upper(target_module) and rp.action_code=upper(target_action) and (mr.scope_type='ORGANIZATION' or (mr.scope_type='PROJECT' and mr.scope_id=target_project))); $$;
revoke all on function public.has_permission(uuid,uuid,text,text) from public,anon;
grant execute on function public.has_permission(uuid,uuid,text,text) to authenticated;
