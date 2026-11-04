-- ============================================================================
--  POS batch-first selling
-- ============================================================================
--  The POS "Choose batch" mode now starts from a batch: the user picks one of
--  the current batches, then sees only the products inside that batch.
--
--  Cashiers cannot read batches/batch_items directly (supplier cost is
--  restricted), so these SECURITY DEFINER helpers expose only safe fields.
-- ============================================================================

create or replace function public.pos_active_batches()
returns table (
  batch_id        uuid,
  batch_number    text,
  date_received   date,
  remaining_units integer,
  item_count      integer
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
      b.id,
      b.batch_number,
      b.date_received,
      coalesce(sum(bi.remaining_quantity), 0)::integer,
      count(bi.id)::integer
    from public.batches b
    join public.batch_items bi on bi.batch_id = b.id
    where bi.remaining_quantity > 0
    group by b.id, b.batch_number, b.date_received, b.created_at
    having coalesce(sum(bi.remaining_quantity), 0) > 0
    order by b.date_received desc, b.created_at desc;
end;
$$;

create or replace function public.pos_batch_items(p_batch_id uuid)
returns table (
  batch_item_id      uuid,
  product_id         uuid,
  sku                text,
  barcode            text,
  name               text,
  brand              text,
  flavor             text,
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
      p.id,
      p.sku,
      p.barcode,
      p.name,
      br.name,
      p.flavor,
      bi.remaining_quantity,
      bi.selling_price
    from public.batch_items bi
    join public.products p on p.id = bi.product_id
    left join public.brands br on br.id = p.brand_id
    where bi.batch_id = p_batch_id
      and bi.remaining_quantity > 0
      and p.is_archived = false
    order by p.name;
end;
$$;

revoke execute on function public.pos_active_batches() from public, anon;
revoke execute on function public.pos_batch_items(uuid) from public, anon;
grant execute on function public.pos_active_batches() to authenticated;
grant execute on function public.pos_batch_items(uuid) to authenticated;

-- Superseded by the batch-first endpoints.
drop function if exists public.product_available_batches(uuid);
