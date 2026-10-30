-- Managers may delete project setup rows that nothing uses any more
-- (e.g. a spare plot made at setup). Rows still in use stay.
drop policy if exists plots_manager_delete on public.plots;
create policy plots_manager_delete on public.plots for delete to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = plots.project_id and public.can_manage_organization(p.organization_id)
  )
  and not exists (select 1 from public.units u where u.plot_id = plots.id)
);

drop policy if exists phases_manager_delete on public.phases;
create policy phases_manager_delete on public.phases for delete to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = phases.project_id and public.can_manage_organization(p.organization_id)
  )
  and not exists (select 1 from public.plots x where x.phase_id = phases.id)
  and not exists (select 1 from public.units u where u.phase_id = phases.id)
);

drop policy if exists house_types_manager_delete on public.house_types;
create policy house_types_manager_delete on public.house_types for delete to authenticated
using (
  public.can_manage_organization(organization_id)
  and not exists (select 1 from public.units u where u.house_type_id = house_types.id)
);
