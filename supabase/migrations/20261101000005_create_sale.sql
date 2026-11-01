-- ============================================================================
-- 0005 — create_sale(): the single checkout path for POS and manual sales
--
-- Guarantees
--   * one transaction: sale + items + allocations + movements + payment
--   * FIFO across batches, or a specific batch when batch_item_id is supplied
--   * row locks prevent overselling under concurrency
--   * prices and costs are read from the database, never trusted from the client
--   * identical idempotency keys return the original receipt
-- ============================================================================

create or replace function public.create_sale(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid            uuid := auth.uid();
  v_role           public.user_role;
  v_sale_id        uuid;
  v_txn            text;
  v_items          jsonb;
  v_item           jsonb;
  v_product_id     uuid;
  v_batch_hint     uuid;
  v_qty            integer;
  v_needed         integer;
  v_take           integer;
  v_alloc          record;
  v_prod           record;
  v_sale_item_id   uuid;
  v_line_value     numeric(14, 2);
  v_line_cost      numeric(14, 2);
  v_subtotal       numeric(14, 2) := 0;
  v_discount       numeric(14, 2) := 0;
  v_total          numeric(14, 2) := 0;
  v_paid           numeric(14, 2) := 0;
  v_method         public.payment_method;
  v_ref            text;
  v_notes          text;
  v_customer_id    uuid;
  v_customer_name  text;
  v_source         public.sale_source;
  v_idem           text;
  v_existing       jsonb;
  v_status         public.payment_status;
  v_sale_date      timestamptz;
  v_response       jsonb;
begin
  v_role := public.assert_role(array['owner', 'manager', 'cashier']::public.user_role[]);

  v_idem := nullif(btrim(coalesce(p_payload ->> 'idempotency_key', '')), '');
  if v_idem is not null then
    -- Serialise retries of the same key so only one sale can be created.
    perform pg_advisory_xact_lock(hashtextextended(v_idem || ':' || v_uid::text, 0));

    select response_json into v_existing
      from public.idempotency_keys
     where key = v_idem and user_id = v_uid;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  v_items := p_payload -> 'items';
  if v_items is null
     or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) = 0 then
    raise exception 'A sale must contain at least one item' using errcode = '22023';
  end if;

  v_source := coalesce(nullif(p_payload ->> 'source', '')::public.sale_source, 'pos');
  v_customer_id := nullif(p_payload ->> 'customer_id', '')::uuid;
  v_customer_name := nullif(btrim(p_payload ->> 'customer_name'), '');
  v_notes := nullif(btrim(p_payload ->> 'notes'), '');
  v_discount := coalesce((p_payload ->> 'discount')::numeric, 0);

  if v_discount < 0 then
    raise exception 'Discount cannot be negative' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_items) e
     group by e ->> 'product_id', coalesce(e ->> 'batch_item_id', '')
    having count(*) > 1
  ) then
    raise exception 'Duplicate product lines in the sale payload' using errcode = '22023';
  end if;

  if v_discount > 0 and v_role not in ('owner', 'manager') then
    raise exception 'Only owners and managers can apply discounts' using errcode = '42501';
  end if;

  -- Manual (backdated) sales are a manager/owner workflow; cashiers use the POS.
  if v_source = 'manual' and v_role = 'cashier' then
    raise exception 'Only owners and managers can record manual sales' using errcode = '42501';
  end if;

  if v_role = 'cashier' and nullif(p_payload ->> 'sale_date', '') is not null then
    raise exception 'Only owners and managers can backdate a sale' using errcode = '42501';
  end if;

  if v_customer_id is not null then
    select name into v_customer_name
      from public.customers
     where id = v_customer_id and is_active = true;

    if v_customer_name is null then
      raise exception 'Customer not found or inactive' using errcode = '23503';
    end if;
  end if;

  v_txn := 'INV-' || lpad(nextval('public.sale_number_seq')::text, 6, '0');

  v_sale_date := coalesce(nullif(p_payload ->> 'sale_date', '')::timestamptz, now());

  insert into public.sales (
    transaction_number, customer_id, customer_name, cashier_id, source,
    subtotal, discount, total, paid_amount, payment_status, status,
    idempotency_key, notes, sale_date
  )
  values (
    v_txn, v_customer_id, v_customer_name, v_uid, v_source,
    0, 0, 0, 0, 'unpaid', 'completed',
    v_idem, v_notes, v_sale_date
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    v_batch_hint := nullif(v_item ->> 'batch_item_id', '')::uuid;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be greater than zero' using errcode = '22023';
    end if;

    select p.id, p.name, p.flavor, p.is_archived, coalesce(br.name, '') as brand
      into v_prod
      from public.products p
      left join public.brands br on br.id = p.brand_id
     where p.id = v_product_id;

    if not found then
      raise exception 'Product % was not found', v_product_id using errcode = '23503';
    end if;

    if v_prod.is_archived then
      raise exception 'Product "%" is archived and cannot be sold', v_prod.name
        using errcode = '22023';
    end if;

    insert into public.sale_items (
      sale_id, product_id, product_name, brand_name, flavor,
      quantity, unit_price, unit_cost, line_total
    )
    values (
      v_sale_id, v_product_id, v_prod.name, v_prod.brand, v_prod.flavor,
      v_qty, 0, 0, 0
    )
    returning id into v_sale_item_id;

    v_needed := v_qty;
    v_line_value := 0;
    v_line_cost := 0;

    -- Lock candidate batches. FIFO unless the caller pinned one batch.
    for v_alloc in
      select bi.id, bi.remaining_quantity, bi.selling_price, bi.supplier_price
        from public.batch_items bi
        join public.batches b on b.id = bi.batch_id
       where bi.product_id = v_product_id
         and bi.remaining_quantity > 0
         and (v_batch_hint is null or bi.id = v_batch_hint)
       order by b.date_received, b.created_at, bi.id
       for update of bi
    loop
      exit when v_needed <= 0;

      v_take := least(v_needed, v_alloc.remaining_quantity);

      update public.batch_items
         set remaining_quantity = remaining_quantity - v_take
       where id = v_alloc.id;

      insert into public.stock_movements (
        product_id, batch_item_id, type, quantity_delta, sale_id, actor_id
      )
      values (
        v_product_id, v_alloc.id, 'sale', -v_take, v_sale_id, v_uid
      );

      insert into public.sale_item_allocations (
        sale_item_id, batch_item_id, quantity, unit_cost, unit_price
      )
      values (
        v_sale_item_id, v_alloc.id, v_take, v_alloc.supplier_price, v_alloc.selling_price
      );

      v_needed := v_needed - v_take;
      v_line_value := v_line_value + (v_take * v_alloc.selling_price);
      v_line_cost := v_line_cost + (v_take * v_alloc.supplier_price);
    end loop;

    if v_needed > 0 then
      raise exception 'Insufficient stock for "%" (short by %)', v_prod.name, v_needed
        using errcode = '23514';
    end if;

    update public.sale_items
       set unit_price = round(v_line_value / v_qty, 2),
           unit_cost  = round(v_line_cost / v_qty, 2),
           line_total = v_line_value
     where id = v_sale_item_id;

    v_subtotal := v_subtotal + v_line_value;
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);

  v_method := coalesce(
    nullif(p_payload -> 'payment' ->> 'method', '')::public.payment_method,
    'cash'
  );
  v_ref := nullif(btrim(p_payload -> 'payment' ->> 'reference_no'), '');
  v_paid := coalesce((p_payload -> 'payment' ->> 'amount')::numeric, 0);

  if v_paid < 0 then
    raise exception 'Payment amount cannot be negative' using errcode = '22023';
  end if;

  if v_paid > v_total then
    raise exception 'Payment (%) exceeds the sale total (%)', v_paid, v_total
      using errcode = '22023';
  end if;

  if v_paid > 0 then
    insert into public.payments (sale_id, amount, method, reference_no, received_by)
    values (v_sale_id, v_paid, v_method, v_ref, v_uid);
  end if;

  v_status := case
    when v_total = 0 then 'paid'::public.payment_status
    when v_paid <= 0 then 'unpaid'::public.payment_status
    when v_paid >= v_total then 'paid'::public.payment_status
    else 'partial'::public.payment_status
  end;

  update public.sales
     set subtotal = v_subtotal,
         discount = v_discount,
         total = v_total,
         paid_amount = v_paid,
         payment_status = v_status
   where id = v_sale_id;

  select jsonb_build_object(
    'sale_id', v_sale_id,
    'transaction_number', v_txn,
    'customer_id', v_customer_id,
    'customer_name', v_customer_name,
    'source', v_source,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total', v_total,
    'paid_amount', v_paid,
    'balance', v_total - v_paid,
    'payment_status', v_status,
    'sale_date', (select sale_date from public.sales where id = v_sale_id),
    'items', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'product_id', si.product_id,
                   'product_name', si.product_name,
                   'brand_name', si.brand_name,
                   'flavor', si.flavor,
                   'quantity', si.quantity,
                   'unit_price', si.unit_price,
                   'unit_cost', si.unit_cost,
                   'line_total', si.line_total
                 )
                 order by si.created_at, si.id
               )
          from public.sale_items si
         where si.sale_id = v_sale_id
      ),
      '[]'::jsonb
    )
  )
  into v_response;

  if v_idem is not null then
    insert into public.idempotency_keys (key, user_id, endpoint, request_hash, response_json)
    values (v_idem, v_uid, 'create_sale', md5(p_payload::text), v_response)
    on conflict (key, user_id) do nothing;
  end if;

  return v_response;
end;
$$;

revoke execute on function public.create_sale(jsonb) from public, anon;
grant execute on function public.create_sale(jsonb) to authenticated;
