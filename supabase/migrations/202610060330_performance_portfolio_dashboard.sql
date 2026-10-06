create or replace function public.get_portfolio_dashboard()
returns table(total_projects bigint,total_plots bigint,total_units bigint,available_units bigint,sold_contracted_units bigint,priced_units bigint,listed_value numeric)
language sql security definer stable set search_path=public as $$
with p as (select id from projects where is_org_member(organization_id)),
u as (select u.* from units u join p on p.id=u.project_id),
pl as (select pl.* from plots pl join p on p.id=pl.project_id)
select (select count(*) from p),(select count(*) from pl),(select count(*) from u),(select count(*) from u where status='AVAILABLE'),(select count(*) from u where status in ('SOLD','TRANSFERRED','CONTRACTED')),(select count(*) from u where list_price is not null),(select coalesce(sum(list_price),0) from u where list_price is not null);
$$;
revoke all on function public.get_portfolio_dashboard() from public,anon;
grant execute on function public.get_portfolio_dashboard() to authenticated;
create index if not exists units_project_status_idx on public.units(project_id,status);
create index if not exists plots_project_idx on public.plots(project_id);
create index if not exists projects_org_created_idx on public.projects(organization_id,created_at);
