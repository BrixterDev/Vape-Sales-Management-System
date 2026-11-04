-- ============================================================================
--  Permanent batch deletion (manual + automatic)
-- ============================================================================
--  Deleting a batch now removes the batch row and every batch_items row. To
--  make that possible without destroying sales, sale allocations and stock
--  movements keep their money/quantity data but drop the batch link:
--
--    * manual delete: owner only, writes off any leftover stock first,
--    * automatic delete: a deferred constraint trigger removes a batch at
--      transaction commit once its last unit is gone.
--
--  Deferred is required: create_sale() decrements batch_items BEFORE it
--  inserts sale_item_allocations, so an immediate trigger would remove the
--  item mid-transaction and break checkout.
-- ============================================================================

/* ------------------------------------------- detachable allocation history */

alter table public.sale_item_allocations
  alter column batch_item_id drop not null;

alter table public.sale_item_allocations
  drop constraint if exists sale_item_allocations_batch_item_id_fkey;

alter table public.sale_item_allocations
  add constraint sale_item_allocations_batch_item_id_fkey
  foreign key (batch_item_id) references public.batch_items (id)
  on delete set null;

/* ------------------------------------------------- automatic sold-out purge */

create or replace function public.auto_delete_empty_batch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid := coalesce(new.batch_id, old.batch_id);
begin
  if not exists (
    select 1
      from public.batch_items
     where batch_id = v_batch_id
       and remaining_quantity > 0
  ) then
    delete from public.batches where id = v_batch_id;
  end if;

  return null;
end;
$$;

revoke execute on function public.auto_delete_empty_batch()
  from public, anon, authenticated;

drop trigger if exists batch_items_auto_delete on public.batch_items;

create constraint trigger batch_items_auto_delete
  after update of remaining_quantity on public.batch_items
  deferrable initially deferred
  for each row execute function public.auto_delete_empty_batch();

/* --------------------------------------------------- remove archive model */

drop trigger if exists batch_items_sync_archive on public.batch_items;
drop function if exists public.sync_batch_archive_status();

-- The view must be recreated (not replaced) because the trailing archive
-- column is being removed.
drop view if exists public.v_batch_summary;

create view public.v_batch_summary
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
  coalesce(sum(bi.remaining_quantity * bi.selling_price), 0)::numeric(14, 2) as remaining_retail_value
from public.batches bt
left join public.suppliers s on s.id = bt.supplier_id
left join public.batch_items bi on bi.batch_id = bt.id
group by bt.id, s.name;

revoke all on public.v_batch_summary from anon;
grant select on public.v_batch_summary to authenticated;

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
    order by b.date_received, b.created_at, bi.created_at, bi.id;
end;
$$;

revoke execute on function public.product_available_batches(uuid) from public, anon;
grant execute on function public.product_available_batches(uuid) to authenticated;

drop index if exists public.batches_active_idx;

alter table public.batches
  drop column if exists is_archived,
  drop column if exists archive_reason,
  drop column if exists archived_at,
  drop column if exists archived_by;

/* --------------------------------------------------------- manual deletion */

create or replace function public.delete_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch  public.batches;
  v_uid    uuid := auth.uid();
  v_item   record;
  v_items  integer := 0;
  v_units  integer := 0;
begin
  perform public.assert_role(array['owner']::public.user_role[]);

  select * into v_batch
    from public.batches
   where id = p_batch_id
   for update;

  if not found then
    raise exception 'Batch not found' using errcode = '23503';
  end if;

  -- Keep an audit trail of stock that is being thrown away with the batch.
  for v_item in
    select id, product_id, remaining_quantity
      from public.batch_items
     where batch_id = p_batch_id
  loop
    v_items := v_items + 1;

    if v_item.remaining_quantity > 0 then
      v_units := v_units + v_item.remaining_quantity;

      insert into public.stock_movements (
        product_id, batch_item_id, type, quantity_delta, actor_id, reason
      )
      values (
        v_item.product_id,
        v_item.id,
        'adjustment',
        -v_item.remaining_quantity,
        v_uid,
        'Batch ' || v_batch.batch_number || ' deleted'
      );
    end if;
  end loop;

  delete from public.batches where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'batch_number', v_batch.batch_number,
    'items_deleted', v_items,
    'units_written_off', v_units
  );
end;
$$;

revoke execute on function public.delete_batch(uuid) from public, anon;
grant execute on function public.delete_batch(uuid) to authenticated;
