-- ============================================================================
--  POS batch selection + batch lifecycle (soft delete / auto-archive)
-- ============================================================================
--  Batches are referenced by sale_item_allocations (ON DELETE RESTRICT) and
--  stock_movements, so a hard delete would either fail or destroy history.
--  Deletion is therefore a soft archive:
--    * owner removes a batch from the Batches page (only when it is empty),
--    * the batch is archived automatically when its last unit sells,
--    * archived batches are hidden from lists and from the POS picker,
--    * restoring or re-stocking an archived batch brings it back (an archived
--      batch never carries stock), so reports and cost history stay intact.
-- ============================================================================

/* --------------------------------------------------- batch archive columns */

alter table public.batches
  add column if not exists is_archived    boolean not null default false,
  add column if not exists archive_reason text,
  add column if not exists archived_at    timestamptz,
  add column if not exists archived_by    uuid references public.profiles (id) on delete set null;

alter table public.batches
  drop constraint if exists batches_archive_reason_valid;

alter table public.batches
  add constraint batches_archive_reason_valid
  check (archive_reason is null or archive_reason in ('manual', 'sold_out'));

create index if not exists batches_active_idx
  on public.batches (is_archived)
  where is_archived = false;

/* ---------------------------------------------------- auto archive trigger */

create or replace function public.sync_batch_archive_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid := coalesce(new.batch_id, old.batch_id);
  v_has_stock boolean;
begin
  select exists (
    select 1
      from public.batch_items
     where batch_id = v_batch_id
       and remaining_quantity > 0
  )
  into v_has_stock;

  if v_has_stock then
    -- Stock came back (adjustment / sale edit): an archived batch with stock
    -- must be sellable again, so lift the archive.
    update public.batches
       set is_archived = false,
           archive_reason = null,
           archived_at = null,
           archived_by = null
     where id = v_batch_id
       and is_archived = true;
  else
    update public.batches
       set is_archived = true,
           archive_reason = 'sold_out',
           archived_at = now(),
           archived_by = null
     where id = v_batch_id
       and is_archived = false;
  end if;

  return null;
end;
$$;

drop trigger if exists batch_items_sync_archive on public.batch_items;

create trigger batch_items_sync_archive
  after insert or update of remaining_quantity on public.batch_items
  for each row execute function public.sync_batch_archive_status();

-- Backfill: every batch that is already empty disappears from the active list.
update public.batches b
   set is_archived = true,
       archive_reason = 'sold_out',
       archived_at = now()
 where b.is_archived = false
   and not exists (
     select 1
       from public.batch_items bi
      where bi.batch_id = b.id
        and bi.remaining_quantity > 0
   );

/* -------------------------------------------------- batch list view column */

create or replace view public.v_batch_summary
with (security_invoker = true)
as
select
  bt.id as batch_id,
  bt.batch_number,
  bt.supplier_id,
  s.name as supplier,
  bt.date_received,
  bt.notes,
  bt.created_at,
  count(bi.id)::integer as item_count,
  coalesce(sum(bi.quantity_received), 0)::integer as total_units,
  coalesce(sum(bi.remaining_quantity), 0)::integer as remaining_units,
  coalesce(sum(bi.quantity_received * bi.supplier_price), 0)::numeric(14, 2) as total_cost,
  coalesce(sum(bi.remaining_quantity * bi.supplier_price), 0)::numeric(14, 2) as remaining_cost,
  coalesce(sum(bi.quantity_received * bi.selling_price), 0)::numeric(14, 2) as potential_revenue,
  coalesce(
    sum(bi.quantity_received * (bi.selling_price - bi.supplier_price)), 0
  )::numeric(14, 2) as potential_profit,
  coalesce(sum(bi.remaining_quantity * bi.selling_price), 0)::numeric(14, 2) as remaining_retail_value,
  bt.is_archived
from public.batches bt
left join public.suppliers s on s.id = bt.supplier_id
left join public.batch_items bi on bi.batch_id = bt.id
group by bt.id, s.name;

/* ------------------------------------------- cashier-safe batch selection */

-- Cashiers cannot read batches/batch_items (supplier cost is restricted), so
-- the POS gets a definer function that exposes only what it needs to sell.
create or replace function public.product_available_batches(p_product_id uuid)
returns table (
  batch_item_id      uuid,
  batch_number       text,
  date_received      date,
  remaining_quantity integer,
  selling_price      numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_role(
    array['owner', 'manager', 'cashier']::public.user_role[]
  );

  return query
    select
      bi.id,
      b.batch_number,
      b.date_received,
      bi.remaining_quantity,
      bi.selling_price
    from public.batch_items bi
    join public.batches b on b.id = bi.batch_id
    where bi.product_id = p_product_id
      and bi.remaining_quantity > 0
      and b.is_archived = false
    order by b.date_received, b.created_at, bi.created_at, bi.id;
end;
$$;

revoke execute on function public.product_available_batches(uuid) from public, anon;
grant execute on function public.product_available_batches(uuid) to authenticated;
