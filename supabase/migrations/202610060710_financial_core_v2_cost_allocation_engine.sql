create or replace function public.generate_cost_allocation(target_run uuid) returns integer language plpgsql security definer set search_path=public as $$
declare r cost_allocation_runs%rowtype; total_basis numeric; n integer; residual numeric;
begin
 select * into r from cost_allocation_runs where id=target_run for update; if not found then raise exception 'Allocation run not found'; end if;
 if r.status<>'DRAFT' then raise exception 'Only DRAFT allocation can be generated'; end if;
 if not can_manage_organization(r.organization_id) or not can_access_project(r.project_id) then raise exception 'Not authorized'; end if;
 if r.method='MANUAL' then raise exception 'Manual allocation lines must be entered explicitly'; end if;
 delete from cost_allocation_lines where allocation_run_id=r.id;
 create temporary table if not exists tmp_alloc(unit_id uuid,basis numeric) on commit drop; truncate tmp_alloc;
 if r.method='LAND_AREA' then insert into tmp_alloc select u.id,coalesce(p.land_area_sqm,0) from units u left join plots p on p.id=u.plot_id where u.project_id=r.project_id;
 elsif r.method='GFA' then insert into tmp_alloc select u.id,coalesce(h.gross_floor_area_sqm,0) from units u left join house_types h on h.id=u.house_type_id where u.project_id=r.project_id;
 elsif r.method='SALES_VALUE' then insert into tmp_alloc select u.id,coalesce(u.list_price,0) from units u where u.project_id=r.project_id; end if;
 select sum(basis),count(*) into total_basis,n from tmp_alloc; if n=0 or coalesce(total_basis,0)<=0 then raise exception 'Allocation basis is missing or zero'; end if;
 insert into cost_allocation_lines(allocation_run_id,unit_id,basis_value,allocation_percent,allocated_amount) select r.id,unit_id,basis,round(basis/total_basis*100,6),round(r.source_amount*basis/total_basis,2) from tmp_alloc where basis>0;
 select r.source_amount-coalesce(sum(allocated_amount),0) into residual from cost_allocation_lines where allocation_run_id=r.id;
 if residual<>0 then update cost_allocation_lines set allocated_amount=allocated_amount+residual where id=(select id from cost_allocation_lines where allocation_run_id=r.id order by allocated_amount desc,id limit 1); end if;
 return (select count(*) from cost_allocation_lines where allocation_run_id=r.id);
end $$;
create or replace function public.post_cost_allocation(target_run uuid) returns void language plpgsql security definer set search_path=public as $$
declare r cost_allocation_runs%rowtype; total_amount numeric; total_pct numeric;
begin
 select * into r from cost_allocation_runs where id=target_run for update; if not found then raise exception 'Allocation run not found'; end if;
 if r.status<>'DRAFT' then raise exception 'Only DRAFT allocation can be posted'; end if;
 if not can_manage_organization(r.organization_id) or not can_access_project(r.project_id) then raise exception 'Not authorized'; end if;
 select coalesce(sum(allocated_amount),0),coalesce(sum(allocation_percent),0) into total_amount,total_pct from cost_allocation_lines where allocation_run_id=r.id;
 if abs(total_amount-r.source_amount)>0.01 then raise exception 'Allocated amount must equal source amount'; end if;
 if abs(total_pct-100)>0.01 then raise exception 'Allocation percent must equal 100'; end if;
 update cost_allocation_runs set status='POSTED',posted_by=auth.uid(),posted_at=now() where id=r.id;
end $$;
revoke all on function generate_cost_allocation(uuid) from public,anon; grant execute on function generate_cost_allocation(uuid) to authenticated;
revoke all on function post_cost_allocation(uuid) from public,anon; grant execute on function post_cost_allocation(uuid) to authenticated;