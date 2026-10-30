-- Managers may delete a plot that no unit sits on (e.g. a spare plot made at setup).
drop policy if exists plots_manager_delete on public.plots;
create policy plots_manager_delete on public.plots for delete to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = plots.project_id and public.can_manage_organization(p.organization_id)
  )
  and not exists (select 1 from public.units u where u.plot_id = plots.id)
);
