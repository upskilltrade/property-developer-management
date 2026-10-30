-- Pricing settings per project: the list price of the standard house on the standard
-- (smallest) plot, and what each extra ตารางวา of land adds to a unit's price.
alter table public.projects
  add column if not exists base_unit_price numeric(14,2) check (base_unit_price >= 0),
  add column if not exists extra_land_price_per_wah numeric(12,2) not null default 25000
    check (extra_land_price_per_wah >= 0);
