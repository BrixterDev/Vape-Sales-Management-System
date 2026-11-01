-- ============================================================================
-- 0006 — Payments, voids, stock adjustments, batches and sale edits
-- ============================================================================

/* --------------------------------------------------------------- add_payment */

create or replace function public.add_payment(
  p_sale_id  uuid,
  p_amount   numeric,
  p_method   public.payment_method,
  p_reference text default null,
  p_notes    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role;
  v_sale     public.sales;
  v_uid      uuid := auth.uid();
  v_paid     numeric(14, 2);
  v_balance  numeric(14, 2);
  v_status   public.payment_status;
begin
  v_role := public.assert_role(array['owner', 'manager', 'cashier']::public.user_role[]);

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found' using errcode = '23503';
  end if;

  if v_sale.status = 'voided' then
    raise exception 'Cannot record a payment on a voided sale' using errcode = '22023';
  end if;

  -- Cashiers may only settle their own transactions.
  if v_role = 'cashier' and v_sale.cashier_id is distinct from v_uid then
    raise exception 'Cashiers can only record payments for their own sales'
      using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where sale_id = p_sale_id and voided_at is null;

  v_balance := v_sale.total - v_paid;

  if p_amount > v_balance then
    raise exception 'Payment (%) exceeds the outstanding balance (%)', p_amount, v_balance
      using errcode = '22023';
  end if;

  insert into public.payments (sale_id, amount, method, reference_no, notes, received_by)
  values (p_sale_id, p_amount, coalesce(p_method, 'cash'), nullif(btrim(p_reference), ''),
          nullif(btrim(p_notes), ''), v_uid);

  v_paid := v_paid + p_amount;
  v_status := case
    when v_paid <= 0 then 'unpaid'::public.payment_status
    when v_paid >= v_sale.total then 'paid'::public.payment_status
    else 'partial'::public.payment_status
  end;

  update public.sales
     set paid_amount = v_paid,
         payment_status = v_status
   where id = p_sale_id;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'paid_amount', v_paid,
    'total', v_sale.total,
    'balance', v_sale.total - v_paid,
    'payment_status', v_status,
    'recorded_by', v_uid,
    'role', v_role
  );
end;
$$;

/* ----------------------------------------------------------------- void_sale */

create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role   public.user_role;
  v_sale   public.sales;
  v_uid    uuid := auth.uid();
  v_alloc  record;
begin
  v_role := public.assert_role(array['owner', 'manager']::public.user_role[]);

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A void reason is required' using errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found' using errcode = '23503';
  end if;

  if v_sale.status = 'voided' then
    raise exception 'Sale is already voided' using errcode = '22023';
  end if;

  -- Restore every batch that this sale consumed.
  for v_alloc in
    select a.id, a.batch_item_id, a.quantity, si.product_id
      from public.sale_item_allocations a
      join public.sale_items si on si.id = a.sale_item_id
     where si.sale_id = p_sale_id
  loop
    update public.batch_items
       set remaining_quantity = remaining_quantity + v_alloc.quantity
     where id = v_alloc.batch_item_id;

    insert into public.stock_movements (
      product_id, batch_item_id, type, quantity_delta, sale_id, actor_id, reason
    )
    values (
      v_alloc.product_id, v_alloc.batch_item_id, 'void_return',
      v_alloc.quantity, p_sale_id, v_uid, btrim(p_reason)
    );
  end loop;

  -- Cash is considered returned when a sale is voided.
  update public.payments
     set voided_at = now(), voided_by = v_uid
   where sale_id = p_sale_id and voided_at is null;

  update public.sales
     set status = 'voided',
         voided_at = now(),
         voided_by = v_uid,
         void_reason = btrim(p_reason),
         paid_amount = 0,
         payment_status = 'unpaid'
   where id = p_sale_id;

  return jsonb_build_object(
    'sale_id', p_sale_id,
    'transaction_number', v_sale.transaction_number,
    'status', 'voided',
    'voided_by', v_uid,
    'void_reason', btrim(p_reason)
  );
end;
$$;

/* ---------------------------------------------------------- update sale info */

create or replace function public.update_sale_details(
  p_sale_id       uuid,
  p_customer_id   uuid,
  p_customer_name text,
  p_notes         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
  v_sale public.sales;
  v_name text;
begin
  v_role := public.assert_role(array['owner', 'manager']::public.user_role[]);

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Sale not found' using errcode = '23503';
  end if;

  if v_sale.status = 'voided' then
    raise exception 'Cannot edit a voided sale' using errcode = '22023';
  end if;

  v_name := nullif(btrim(p_customer_name), '');

  if p_customer_id is not null then
    select name into v_name from public.customers where id = p_customer_id;
    if v_name is null then
      raise exception 'Customer not found' using errcode = '23503';
    end if;
  end if;

  update public.sales
     set customer_id = p_customer_id,
         customer_name = v_name,
         notes = nullif(btrim(p_notes), '')
   where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id);
end;
$$;

/* ------------------------------------------------------------ adjust_stock */

create or replace function public.adjust_stock(
  p_batch_item_id uuid,
  p_quantity_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role;
  v_item    public.batch_items;
  v_new_qty integer;
begin
  v_role := public.assert_role(array['owner', 'manager']::public.user_role[]);

  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Adjustment cannot be zero' using errcode = '22023';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'An adjustment reason is required' using errcode = '22023';
  end if;

  select * into v_item from public.batch_items where id = p_batch_item_id for update;
  if not found then
    raise exception 'Batch item not found' using errcode = '23503';
  end if;

  v_new_qty := v_item.remaining_quantity + p_quantity_delta;

  if v_new_qty < 0 or v_new_qty > v_item.quantity_received then
    raise exception 'Adjustment would leave % units, valid range is 0..%',
      v_new_qty, v_item.quantity_received using errcode = '23514';
  end if;

  update public.batch_items
     set remaining_quantity = v_new_qty
   where id = p_batch_item_id;

  insert into public.stock_movements (
    product_id, batch_item_id, type, quantity_delta, actor_id, reason
  )
  values (
    v_item.product_id, p_batch_item_id, 'adjustment', p_quantity_delta,
    auth.uid(), btrim(p_reason)
  );

  return jsonb_build_object(
    'batch_item_id', p_batch_item_id,
    'previous_quantity', v_item.remaining_quantity,
    'new_quantity', v_new_qty
  );
end;
$$;

/* ------------------------------------------------------------- create_batch */

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

revoke execute on function public.add_payment(uuid, numeric, public.payment_method, text, text) from public, anon;
revoke execute on function public.void_sale(uuid, text) from public, anon;
revoke execute on function public.update_sale_details(uuid, uuid, text, text) from public, anon;
revoke execute on function public.adjust_stock(uuid, integer, text) from public, anon;
revoke execute on function public.create_batch(jsonb) from public, anon;

grant execute on function public.add_payment(uuid, numeric, public.payment_method, text, text) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
grant execute on function public.update_sale_details(uuid, uuid, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, text) to authenticated;
grant execute on function public.create_batch(jsonb) to authenticated;
