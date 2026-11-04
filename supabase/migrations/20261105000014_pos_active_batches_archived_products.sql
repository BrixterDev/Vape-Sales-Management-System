-- Align the batch selector with the batch item list: archived products are not
-- sellable, so they must not make a batch look non-empty in the POS.

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
    join public.products p on p.id = bi.product_id
    where bi.remaining_quantity > 0
      and p.is_archived = false
    group by b.id, b.batch_number, b.date_received, b.created_at
    having coalesce(sum(bi.remaining_quantity), 0) > 0
    order by b.date_received desc, b.created_at desc;
end;
$$;
