-- ============================================================================
-- 0010 — Sale editing and batch brand rules
--
--  * edit_sale(): corrects a registered sale by voiding it (stock returns,
--    payments reverse) and rebooking the edited payload through create_sale().
--    The original transaction stays in the audit trail as voided.
--  * create_batch(): now rejects batches that mix brands — one batch belongs
--    to a single brand, matching the store's receiving workflow.
-- ============================================================================

create or replace function public.create_batch(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        public.user_role;
  v_batch_id    uuid;
  v_number      text;
  v_supplier_id uuid;
  v_received    date;
  v_notes       text;
  v_items       jsonb;
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         integer;
  v_cost        numeric(12, 2);
  v_price       numeric(12, 2);
  v_item_id     uuid;
  v_count       integer := 0;
  v_brand_count integer;
begin
  v_role := public.assert_role(array['owner', 'manager']::public.user_role[]);

  v_number := nullif(btrim(p_payload ->> 'batch_number'), '');
  if v_number is null then
    raise exception 'Batch number is required' using errcode = '22023';
  end if;

  v_supplier_id := nullif(p_payload ->> 'supplier_id', '')::uuid;
  v_received := coalesce(nullif(p_payload ->> 'date_received', '')::date, current_date);
  v_notes := nullif(btrim(p_payload ->> 'notes'), '');
  v_items := p_payload -> 'items';

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'A batch needs at least one product' using errcode = '22023';
  end if;

  if exists (
    select 1 from (
      select e ->> 'product_id' as pid
        from jsonb_array_elements(v_items) e
       group by 1
      having count(*) > 1
    ) d
  ) then
    raise exception 'The same product appears twice in this batch' using errcode = '22023';
  end if;

  -- A single batch may only carry items of one brand.
  select count(distinct p.brand_id) into v_brand_count
    from public.products p
   where p.id in (
     select (e ->> 'product_id')::uuid
       from jsonb_array_elements(v_items) e
   );

  if v_brand_count > 1 then
    raise exception 'A batch can only contain items of a single brand' using errcode = '22023';
  end if;

  if v_supplier_id is not null then
    perform 1 from public.suppliers where id = v_supplier_id;
    if not found then
      raise exception 'Supplier not found' using errcode = '23503';
    end if;
  end if;

  insert into public.batches (batch_number, supplier_id, date_received, notes, created_by)
  values (v_number, v_supplier_id, v_received, v_notes, auth.uid())
  returning id into v_batch_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty := coalesce((v_item ->> 'quantity_received')::integer, 0);
    v_cost := (v_item ->> 'supplier_price')::numeric;
    v_price := (v_item ->> 'selling_price')::numeric;

    if v_qty <= 0 then
      raise exception 'Quantity received must be greater than zero' using errcode = '22023';
    end if;
    if v_cost is null or v_cost < 0 or v_price is null or v_price < 0 then
      raise exception 'Prices cannot be negative' using errcode = '22023';
    end if;

    perform 1 from public.products where id = v_product_id;
    if not found then
      raise exception 'Product % was not found', v_product_id using errcode = '23503';
    end if;

    insert into public.batch_items (
      batch_id, product_id, quantity_received, remaining_quantity,
      supplier_price, selling_price
    )
    values (
      v_batch_id, v_product_id, v_qty, v_qty, v_cost, v_price
    )
    returning id into v_item_id;

    insert into public.stock_movements (
      product_id, batch_item_id, type, quantity_delta, actor_id, reason
    )
    values (
      v_product_id, v_item_id, 'receive', v_qty, auth.uid(),
      'Received in batch ' || v_number
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_number', v_number,
    'item_count', v_count
  );
end;
$$;

revoke execute on function public.create_batch(jsonb) from public, anon;

grant execute on function public.create_batch(jsonb) to authenticated;

/* ------------------------------------------------------------------ edit_sale */

create or replace function public.edit_sale(
  p_sale_id uuid,
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role   public.user_role;
  v_result jsonb;
begin
  v_role := public.assert_role(array['owner', 'manager']::public.user_role[]);

  if v_role <> 'owner' and v_role <> 'manager' then
    raise exception 'Only owners and managers can edit sales' using errcode = '42501';
  end if;

  -- Voiding restores stock, reverses recorded payments and stamps the
  -- immutable audit trail. Rebooking then creates the corrected transaction.
  perform public.void_sale(p_sale_id, p_reason);

  select public.create_sale(p_payload) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.edit_sale(uuid, jsonb, text) from public, anon;
grant execute on function public.edit_sale(uuid, jsonb, text) to authenticated;
