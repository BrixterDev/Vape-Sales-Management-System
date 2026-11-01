-- ============================================================================
-- 0001 — Enums, tables, constraints and indexes
-- ============================================================================

create type public.user_role as enum ('owner', 'manager', 'cashier');
create type public.sale_status as enum ('completed', 'voided');
create type public.sale_source as enum ('pos', 'manual');
create type public.payment_status as enum ('unpaid', 'partial', 'paid');
create type public.payment_method as enum ('cash', 'gcash', 'bank_transfer', 'other');
create type public.movement_type as enum ('receive', 'sale', 'void_return', 'adjustment');

-- Human friendly transaction numbers: INV-000001
create sequence public.sale_number_seq as bigint start with 1 increment by 1;

-- ------------------------------------------------------------------ profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.user_role not null default 'cashier',
  is_active   boolean not null default true,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------- brands
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint brands_name_unique unique (name),
  constraint brands_name_not_blank check (length(btrim(name)) > 0)
);

-- ------------------------------------------------------------------ products
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null,
  barcode             text,
  name                text not null,
  brand_id            uuid references public.brands (id) on delete set null,
  flavor              text not null,
  nicotine_strength   text,
  selling_price       numeric(12, 2) not null default 0,
  low_stock_threshold integer not null default 5,
  is_archived         boolean not null default false,
  notes               text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint products_sku_unique unique (sku),
  constraint products_barcode_unique unique (barcode),
  constraint products_price_non_negative check (selling_price >= 0),
  constraint products_threshold_non_negative check (low_stock_threshold >= 0),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_flavor_not_blank check (length(btrim(flavor)) > 0)
);

-- ----------------------------------------------------------------- suppliers
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint suppliers_name_not_blank check (length(btrim(name)) > 0)
);

-- ------------------------------------------------------------------- batches
create table public.batches (
  id            uuid primary key default gen_random_uuid(),
  batch_number  text not null,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  date_received date not null default current_date,
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint batches_number_unique unique (batch_number),
  constraint batches_number_not_blank check (length(btrim(batch_number)) > 0)
);

create table public.batch_items (
  id                  uuid primary key default gen_random_uuid(),
  batch_id            uuid not null references public.batches (id) on delete cascade,
  product_id          uuid not null references public.products (id) on delete restrict,
  quantity_received   integer not null,
  remaining_quantity  integer not null,
  supplier_price      numeric(12, 2) not null,
  selling_price       numeric(12, 2) not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint batch_items_batch_product_unique unique (batch_id, product_id),
  constraint batch_items_qty_positive check (quantity_received > 0),
  constraint batch_items_remaining_valid
    check (remaining_quantity >= 0 and remaining_quantity <= quantity_received),
  constraint batch_items_supplier_price_non_negative check (supplier_price >= 0),
  constraint batch_items_selling_price_non_negative check (selling_price >= 0)
);

-- ----------------------------------------------------------------- customers
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customers_name_not_blank check (length(btrim(name)) > 0)
);

-- --------------------------------------------------------------------- sales
create table public.sales (
  id                 uuid primary key default gen_random_uuid(),
  transaction_number text not null,
  customer_id        uuid references public.customers (id) on delete set null,
  customer_name      text,
  cashier_id         uuid not null references public.profiles (id) on delete restrict,
  source             public.sale_source not null default 'pos',
  subtotal           numeric(14, 2) not null default 0,
  discount           numeric(14, 2) not null default 0,
  total              numeric(14, 2) not null default 0,
  paid_amount        numeric(14, 2) not null default 0,
  payment_status     public.payment_status not null default 'unpaid',
  status             public.sale_status not null default 'completed',
  idempotency_key    text,
  notes              text,
  sale_date          timestamptz not null default now(),
  voided_at          timestamptz,
  voided_by          uuid references public.profiles (id) on delete set null,
  void_reason        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sales_transaction_number_unique unique (transaction_number),
  constraint sales_idempotency_key_unique unique (idempotency_key),
  constraint sales_subtotal_non_negative check (subtotal >= 0),
  constraint sales_discount_non_negative check (discount >= 0),
  constraint sales_total_non_negative check (total >= 0),
  constraint sales_paid_non_negative check (paid_amount >= 0),
  constraint sales_paid_not_above_total check (paid_amount <= total),
  constraint sales_void_fields_consistent check (
    (status = 'completed' and voided_at is null)
    or (status = 'voided' and voided_at is not null)
  )
);

create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  brand_name   text not null default '',
  flavor       text not null default '',
  quantity     integer not null,
  unit_price   numeric(12, 2) not null,
  unit_cost    numeric(12, 2) not null,
  line_total   numeric(14, 2) not null,
  created_at   timestamptz not null default now(),
  constraint sale_items_qty_positive check (quantity > 0),
  constraint sale_items_price_non_negative check (unit_price >= 0),
  constraint sale_items_cost_non_negative check (unit_cost >= 0)
);

-- One row per (sale line, batch) pair consumed. This is the source of truth
-- for historical cost and for restoring stock when a sale is voided.
create table public.sale_item_allocations (
  id           uuid primary key default gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items (id) on delete cascade,
  batch_item_id uuid not null references public.batch_items (id) on delete restrict,
  quantity     integer not null,
  unit_cost    numeric(12, 2) not null,
  unit_price   numeric(12, 2) not null,
  created_at   timestamptz not null default now(),
  constraint sale_allocations_qty_positive check (quantity > 0),
  constraint sale_allocations_cost_non_negative check (unit_cost >= 0),
  constraint sale_allocations_price_non_negative check (unit_price >= 0)
);

-- ------------------------------------------------------------------ payments
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales (id) on delete cascade,
  amount      numeric(12, 2) not null,
  method      public.payment_method not null default 'cash',
  reference_no text,
  notes       text,
  paid_at     timestamptz not null default now(),
  received_by uuid references public.profiles (id) on delete set null,
  voided_at   timestamptz,
  voided_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint payments_amount_positive check (amount > 0)
);

-- ----------------------------------------------------------- stock movements
create table public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete restrict,
  batch_item_id uuid references public.batch_items (id) on delete set null,
  type          public.movement_type not null,
  quantity_delta integer not null,
  sale_id       uuid references public.sales (id) on delete set null,
  actor_id      uuid references public.profiles (id) on delete set null,
  reason        text,
  created_at    timestamptz not null default now(),
  constraint stock_movements_delta_non_zero check (quantity_delta <> 0),
  -- Blocks double deduction / double restock for the same sale + batch.
  constraint stock_movements_sale_dedup unique (sale_id, batch_item_id, type)
);

-- ---------------------------------------------------------------- audit logs
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------ idempotency support
create table public.idempotency_keys (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null,
  request_hash  text,
  response_json jsonb not null,
  created_at    timestamptz not null default now(),
  constraint idempotency_keys_key_user_unique unique (key, user_id)
);

-- ------------------------------------------------------------------- settings
create table public.settings (
  id                smallint primary key default 1,
  store_name        text not null default 'Vape Store',
  address           text,
  phone             text,
  receipt_footer    text,
  default_low_stock integer not null default 5,
  currency          text not null default 'PHP',
  updated_at        timestamptz not null default now(),
  constraint settings_single_row check (id = 1)
);

-- -------------------------------------------------------------------- indexes
create index products_brand_idx on public.products (brand_id);
create index products_archived_idx on public.products (is_archived);
create index products_name_idx on public.products (lower(name));

create index batches_supplier_idx on public.batches (supplier_id, date_received desc);
create index batch_items_product_idx on public.batch_items (product_id);
create index batch_items_batch_idx on public.batch_items (batch_id);
create index batch_items_fifo_idx
  on public.batch_items (product_id, remaining_quantity)
  include (selling_price, supplier_price);

create index sales_date_idx on public.sales (sale_date desc);
create index sales_cashier_idx on public.sales (cashier_id, sale_date desc);
create index sales_customer_idx on public.sales (customer_id, sale_date desc);
create index sales_status_date_idx on public.sales (status, sale_date desc);
create index sales_payment_status_idx on public.sales (payment_status);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);
create index sale_allocations_item_idx on public.sale_item_allocations (sale_item_id);
create index sale_allocations_batch_idx on public.sale_item_allocations (batch_item_id);

create index payments_sale_idx on public.payments (sale_id);
create index payments_paid_at_idx on public.payments (paid_at desc);
create index payments_received_by_idx on public.payments (received_by);

create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_sale_idx on public.stock_movements (sale_id);
create index stock_movements_batch_idx on public.stock_movements (batch_item_id);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
