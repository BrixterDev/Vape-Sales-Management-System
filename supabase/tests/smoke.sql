-- ============================================================================
-- Smoke tests for the vape store schema, RLS and transactional RPCs.
--
-- Runs entirely inside a transaction and rolls back, so it is safe against the
-- live database. Execute with:
--   npx supabase db query --linked -f supabase/tests/smoke.sql
--
-- Any failed invariant raises an exception and aborts the script. A silent
-- success (empty result set) means every check passed.
-- ============================================================================

begin;

-- ------------------------------------------------------------------ fixtures
select set_config('request.jwt.claims', '{}', true);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'smoke-owner@example.test', '', now(), '{}'::jsonb,
   '{"full_name":"Smoke Owner"}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'smoke-cashier1@example.test', '', now(), '{}'::jsonb,
   '{"full_name":"Smoke Cashier One"}'::jsonb, now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'smoke-cashier2@example.test', '', now(), '{}'::jsonb,
   '{"full_name":"Smoke Cashier Two"}'::jsonb, now(), now());

update public.profiles set role = 'owner'
 where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set role = 'cashier'
 where id in (
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333'
 );

insert into public.brands (id, name)
values ('44444444-4444-4444-8444-444444444444', 'Smoke Brand');

insert into public.suppliers (id, name)
values ('aaaaaaaa-0000-4000-8000-000000000000', 'Smoke Supplier');

insert into public.products (
  id, sku, name, brand_id, flavor, selling_price, low_stock_threshold
)
values
  ('55555555-5555-4555-8555-555555555555', 'SMK-1', 'Smoke P1',
   '44444444-4444-4444-8444-444444444444', 'Mint', 350, 2),
  ('66666666-6666-4666-8666-666666666666', 'SMK-2', 'Smoke P2',
   '44444444-4444-4444-8444-444444444444', 'Mango', 120, 1);

-- Older batch first so FIFO is observable.
insert into public.batches (id, batch_number, supplier_id, date_received)
values
  ('77777777-7777-4777-8777-777777777771', 'SMOKE-B1',
   'aaaaaaaa-0000-4000-8000-000000000000', current_date - 2),
  ('77777777-7777-4777-8777-777777777772', 'SMOKE-B2',
   'aaaaaaaa-0000-4000-8000-000000000000', current_date - 1);

insert into public.batch_items (
  id, batch_id, product_id, quantity_received, remaining_quantity,
  supplier_price, selling_price
)
values
  ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777771',
   '55555555-5555-4555-8555-555555555555', 10, 10, 200, 350),
  ('99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777772',
   '55555555-5555-4555-8555-555555555555', 5, 5, 220, 380),
  ('aaaaaaaa-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777771',
   '66666666-6666-4666-8666-666666666666', 3, 3, 70, 120);

-- ============================================================ cashier 1 =====
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  false
);
set local role authenticated;

-- Stock must be visible to a cashier (regression: invoker view bug showed 0).
do $$
declare
  v_stock integer;
begin
  select stock_qty into v_stock
    from public.v_product_stock
   where id = '55555555-5555-4555-8555-555555555555';

  if v_stock <> 15 then
    raise exception 'TEST FAIL: cashier sees stock % instead of 15', v_stock;
  end if;
end;
$$;

-- Cost views stay hidden from cashiers.
do $$
declare
  v_cost numeric;
begin
  select coalesce(sum(stock_cost), 0) into v_cost from public.v_product_stock_costs;
  if v_cost <> 0 then
    raise exception 'TEST FAIL: cashier sees stock cost %', v_cost;
  end if;
end;
$$;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.batch_items;
  if v_n <> 0 then raise exception 'TEST FAIL: cashier sees % batch items', v_n; end if;

  select count(*) into v_n from public.suppliers;
  if v_n <> 0 then raise exception 'TEST FAIL: cashier sees % suppliers', v_n; end if;
end;
$$;

-- FIFO sale with a partial payment.
do $$
declare
  v_res jsonb;
begin
  v_res := public.create_sale($json$
    {
      "source": "pos",
      "customer_name": "Smoke Walk-in",
      "items": [{"product_id": "55555555-5555-4555-8555-555555555555", "quantity": 12}],
      "payment": {"method": "cash", "amount": 1000},
      "idempotency_key": "smoke-1"
    }
  $json$::jsonb);

  if (v_res ->> 'total')::numeric <> 4260 then
    raise exception 'TEST FAIL: FIFO total is %', v_res ->> 'total';
  end if;

  if (v_res ->> 'paid_amount')::numeric <> 1000 then
    raise exception 'TEST FAIL: paid amount is %', v_res ->> 'paid_amount';
  end if;

  if v_res ->> 'payment_status' <> 'partial' then
    raise exception 'TEST FAIL: status is %', v_res ->> 'payment_status';
  end if;

  if (select count(*) from public.v_sale_allocations
       where sale_item_id in (
         select id from public.v_sale_items
          where sale_id = (v_res ->> 'sale_id')::uuid
       )) <> 2 then
    raise exception 'TEST FAIL: expected a two-batch FIFO split';
  end if;
end;
$$;

do $$
begin
  if (select remaining_quantity from public.batch_items
       where id = '88888888-8888-4888-8888-888888888888') <> 0 then
    raise exception 'TEST FAIL: oldest batch was not drained first';
  end if;

  if (select remaining_quantity from public.batch_items
       where id = '99999999-9999-4999-8999-999999999999') <> 3 then
    raise exception 'TEST FAIL: newer batch remaining is wrong';
  end if;
end;
$$;

select set_config(
  'smoke.sale_id',
  (select id::text from public.sales where idempotency_key = 'smoke-1'),
  false
);

-- Replaying the same idempotency key must not deduct stock again.
do $$
declare
  v_res jsonb;
begin
  v_res := public.create_sale($json$
    {
      "source": "pos",
      "customer_name": "Smoke Walk-in",
      "items": [{"product_id": "55555555-5555-4555-8555-555555555555", "quantity": 12}],
      "payment": {"method": "cash", "amount": 1000},
      "idempotency_key": "smoke-1"
    }
  $json$::jsonb);

  if (select count(*) from public.sales where idempotency_key = 'smoke-1') <> 1 then
    raise exception 'TEST FAIL: idempotent retry created a second sale';
  end if;

  if (select remaining_quantity from public.batch_items
       where id = '99999999-9999-4999-8999-999999999999') <> 3 then
    raise exception 'TEST FAIL: idempotent retry deducted stock again';
  end if;
end;
$$;

-- Overselling is rejected and does not leave a sale behind.
do $$
begin
  begin
    perform public.create_sale($json$
      {
        "source": "pos",
        "items": [{"product_id": "55555555-5555-4555-8555-555555555555", "quantity": 9999}],
        "payment": {"method": "cash", "amount": 0}
      }
    $json$::jsonb);
    raise exception 'TEST FAIL: overselling was accepted';
  exception
    when sqlstate '23514' then null;
  end;

  if (select count(*) from public.sales) <> 1 then
    raise exception 'TEST FAIL: failed checkout left a sale row';
  end if;
end;
$$;

-- Cashiers cannot backdate, discount or record manual sales.
do $$
begin
  begin
    perform public.create_sale($json$
      {"source":"manual","items":[{"product_id":"66666666-6666-4666-8666-666666666666","quantity":1}]}
    $json$::jsonb);
    raise exception 'TEST FAIL: cashier created a manual sale';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.create_sale($json$
      {"source":"pos","discount":10,"items":[{"product_id":"66666666-6666-4666-8666-666666666666","quantity":1}]}
    $json$::jsonb);
    raise exception 'TEST FAIL: cashier applied a discount';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.create_sale($json$
      {"source":"pos","sale_date":"2020-01-01T00:00:00Z","items":[{"product_id":"66666666-6666-4666-8666-666666666666","quantity":1}]}
    $json$::jsonb);
    raise exception 'TEST FAIL: cashier backdated a sale';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- Full settlement, overpayment guard and one-sale-per-cashier guard.
do $$
declare
  v_sale_id uuid;
begin
  select id into v_sale_id from public.sales where idempotency_key = 'smoke-1';

  begin
    perform public.add_payment(v_sale_id, 99999, 'cash', null, null);
    raise exception 'TEST FAIL: overpayment was accepted';
  exception when sqlstate '22023' then null;
  end;

  perform public.add_payment(v_sale_id, 3260, 'gcash', 'REF-1', 'settled in smoke test');

  if (select payment_status from public.sales where id = v_sale_id) <> 'paid' then
    raise exception 'TEST FAIL: sale did not become paid';
  end if;
end;
$$;

-- Payment history is append-only: two rows, none deleted.
do $$
begin
  if (select count(*) from public.payments
       where sale_id = (select id from public.sales where idempotency_key = 'smoke-1')) <> 2 then
    raise exception 'TEST FAIL: expected two payment rows';
  end if;
end;
$$;

-- Cashier cost masking in sale history.
do $$
declare
  v_cost numeric;
begin
  select unit_cost into v_cost
    from public.v_sale_items
   where sale_id = (select id from public.sales where idempotency_key = 'smoke-1')
   limit 1;

  if v_cost is not null then
    raise exception 'TEST FAIL: cashier sees sale unit cost %', v_cost;
  end if;

  begin
    perform 1 from public.sale_items limit 1;
    raise exception 'TEST FAIL: cashier can read the base sale_items table';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Profit is masked in aggregates for cashiers.
do $$
declare
  v_profit numeric;
begin
  select gross_profit into v_profit
    from public.best_sellers(now() - interval '1 day', now() + interval '1 day', 10)
   where product_id = '55555555-5555-4555-8555-555555555555';

  if v_profit <> 0 then
    raise exception 'TEST FAIL: cashier sees best-seller profit %', v_profit;
  end if;

  v_profit := (public.dashboard_metrics(
    now() - interval '1 day', now() + interval '1 day'
  ) ->> 'gross_profit')::numeric;

  if v_profit <> 0 then
    raise exception 'TEST FAIL: cashier sees dashboard profit %', v_profit;
  end if;
end;
$$;

-- ============================================================ cashier 2 =====
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  false
);
set local role authenticated;

do $$
begin
  perform public.create_sale($json$
    {
      "source": "pos",
      "items": [{"product_id": "66666666-6666-4666-8666-666666666666", "quantity": 1}],
      "payment": {"method": "cash", "amount": 100},
      "idempotency_key": "smoke-2"
    }
  $json$::jsonb);

  if (select count(*) from public.sales) <> 1 then
    raise exception 'TEST FAIL: cashier 2 sees more than their own sales';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.add_payment(
      current_setting('smoke.sale_id')::uuid,
      10, 'cash', null, null
    );
    raise exception 'TEST FAIL: cashier paid another cashier''s sale';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- Owner visibility: same row count is two, and cost is present.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  false
);
set local role authenticated;

do $$
declare
  v_n integer;
  v_cost numeric;
begin
  select count(*) into v_n from public.sales where idempotency_key in ('smoke-1', 'smoke-2');
  if v_n <> 2 then raise exception 'TEST FAIL: owner sees % sales instead of 2', v_n; end if;

  select count(*) into v_n from public.suppliers;
  if v_n < 1 then raise exception 'TEST FAIL: owner sees no suppliers'; end if;

  select unit_cost into v_cost
    from public.v_sale_items
   where sale_id = (select id from public.sales where idempotency_key = 'smoke-1')
   limit 1;

  if v_cost is null or v_cost <= 0 then
    raise exception 'TEST FAIL: owner cannot see unit cost';
  end if;
end;
$$;

-- Cashiers cannot void; owners can, restoring stock and voiding payments.
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  false
);
set local role authenticated;

do $$
begin
  begin
    perform public.void_sale(
      (select id from public.sales where idempotency_key = 'smoke-1'), 'cashier attempt'
    );
    raise exception 'TEST FAIL: cashier voided a sale';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  false
);
set local role authenticated;

do $$
declare
  v_sale_id uuid;
begin
  select id into v_sale_id from public.sales where idempotency_key = 'smoke-1';
  perform public.void_sale(v_sale_id, 'smoke test void');

  if (select status from public.sales where id = v_sale_id) <> 'voided' then
    raise exception 'TEST FAIL: sale is not voided';
  end if;

  if (select count(*) from public.payments where sale_id = v_sale_id and voided_at is null) <> 0 then
    raise exception 'TEST FAIL: payments survived the void';
  end if;

  if (select remaining_quantity from public.batch_items
       where id = '88888888-8888-4888-8888-888888888888') <> 10
     or (select remaining_quantity from public.batch_items
          where id = '99999999-9999-4999-8999-999999999999') <> 5 then
    raise exception 'TEST FAIL: void did not restore batch stock';
  end if;

  if (select count(*) from public.stock_movements
       where sale_id = v_sale_id and type = 'void_return') <> 2 then
    raise exception 'TEST FAIL: expected two void_return movements';
  end if;
end;
$$;

-- Owner guards: batch costs are immutable and stock cannot fall below zero.
reset role;

do $$
begin
  begin
    update public.batch_items
       set supplier_price = 1
     where id = '99999999-9999-4999-8999-999999999999';
    raise exception 'TEST FAIL: batch cost was edited';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  false
);
set local role authenticated;

do $$
begin
  begin
    perform public.adjust_stock('99999999-9999-4999-8999-999999999999', -99, 'too much');
    raise exception 'TEST FAIL: stock went negative';
  exception when sqlstate '23514' then null;
  end;
end;
$$;

-- A batch may only contain items of a single brand.
insert into public.brands (id, name)
values ('55555555-5555-4555-8555-555555455555', 'Smoke Brand Two');

insert into public.products (
  id, sku, name, brand_id, flavor, selling_price, low_stock_threshold
)
values
  ('55555555-5555-4555-8555-555555455556', 'SMK-9', 'Smoke P9',
   '55555555-5555-4555-8555-555555455555', 'Mint', 300, 1);

do $$
begin
  begin
    perform public.create_batch($json$
      {
        "batch_number": "SMOKE-MIX",
        "items": [
          {"product_id": "55555555-5555-4555-8555-555555555555", "quantity_received": 1, "supplier_price": 200, "selling_price": 350},
          {"product_id": "55555555-5555-4555-8555-555555455556", "quantity_received": 1, "supplier_price": 70, "selling_price": 120}
        ]
      }
    $json$::jsonb);
    raise exception 'TEST FAIL: mixed-brand batch was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

-- Owners can edit a completed sale: it is voided and a corrected sale is booked.
do $$
declare
  v_edit jsonb;
begin
  v_edit := public.edit_sale(
    (select id from public.sales where idempotency_key = 'smoke-2'),
    '{"source":"pos","items":[{"product_id":"66666666-6666-4666-8666-666666666666","quantity":2}],"payment":{"method":"cash","amount":120}}'::jsonb,
    'edited in smoke test'
  );

  if (select status from public.sales where idempotency_key = 'smoke-2') <> 'voided' then
    raise exception 'TEST FAIL: edited sale was not voided';
  end if;

  if (v_edit ->> 'total')::numeric <> 240 then
    raise exception 'TEST FAIL: edited total is %', v_edit ->> 'total';
  end if;
end;
$$;

reset role;

-- -------------------------------------------------------------- audit trail
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.audit_logs where table_name = 'sales';
  if v_n < 2 then
    raise exception 'TEST FAIL: sales audit trail has % rows', v_n;
  end if;
end;
$$;

rollback;
