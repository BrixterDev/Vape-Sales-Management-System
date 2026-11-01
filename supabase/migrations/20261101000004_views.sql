-- ============================================================================
-- 0004 — Reporting views
--
-- Cost visibility:
--   v_product_stock is a definer view exposing only non-sensitive stock data
--   (quantities, selling price, retail value). Cashiers need it for the POS.
--
--   v_product_stock_costs is an invoker view that joins batch_items, so RLS
--   hides supplier prices from cashiers. Managers/owners get real costs.
--
--   v_inventory_value is also invoker, therefore manager/owner only.
--   v_inventory_summary_public exposes the aggregate cashiers need, with no
--   cost columns.
-- ============================================================================

create or replace view public.v_product_stock as
select
  p.id,
  p.sku,
  p.barcode,
  p.name,
  p.brand_id,
  b.name as brand,
  p.flavor,
  p.nicotine_strength,
  p.selling_price,
  p.low_stock_threshold,
  p.is_archived,
  p.notes,
  p.created_at,
  p.updated_at,
  coalesce(sum(bi.remaining_quantity), 0)::integer as stock_qty,
  coalesce(sum(bi.remaining_quantity * bi.selling_price), 0)::numeric(14, 2) as retail_value,
  (
    coalesce(sum(bi.remaining_quantity), 0) <= p.low_stock_threshold
    and p.is_archived = false
  ) as is_low_stock
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.batch_items bi
  on bi.product_id = p.id
 and bi.remaining_quantity > 0
group by p.id, b.name;

create or replace view public.v_product_stock_costs
with (security_invoker = true)
as
select
  p.id as product_id,
  coalesce(sum(bi.remaining_quantity), 0)::integer as stock_qty,
  coalesce(sum(bi.remaining_quantity * bi.supplier_price), 0)::numeric(14, 2) as stock_cost,
  coalesce(sum(bi.remaining_quantity * bi.selling_price), 0)::numeric(14, 2) as retail_value
from public.products p
left join public.batch_items bi
  on bi.product_id = p.id
 and bi.remaining_quantity > 0
group by p.id;

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
  coalesce(sum(bi.remaining_quantity * bi.selling_price), 0)::numeric(14, 2) as remaining_retail_value
from public.batches bt
left join public.suppliers s on s.id = bt.supplier_id
left join public.batch_items bi on bi.batch_id = bt.id
group by bt.id, s.name;

create or replace view public.v_sale_balances
with (security_invoker = true)
as
select
  s.*,
  (s.total - s.paid_amount)::numeric(14, 2) as balance,
  (
    select coalesce(sum(si.quantity), 0)::integer
      from public.sale_items si
     where si.sale_id = s.id
  ) as item_count
from public.sales s;

create or replace view public.v_customer_balances
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.address,
  c.notes,
  c.is_active,
  c.created_at,
  count(s.id) filter (where s.status = 'completed')::integer as transaction_count,
  coalesce(sum(s.total) filter (where s.status = 'completed'), 0)::numeric(14, 2) as total_purchases,
  coalesce(
    sum(s.total - s.paid_amount) filter (where s.status = 'completed'), 0
  )::numeric(14, 2) as outstanding
from public.customers c
left join public.sales s on s.customer_id = c.id
group by c.id;

create or replace view public.v_inventory_value
with (security_invoker = true)
as
select
  coalesce(sum(stock_qty), 0)::integer as total_units,
  coalesce(sum(stock_cost), 0)::numeric(14, 2) as total_cost_value,
  coalesce(sum(retail_value), 0)::numeric(14, 2) as total_retail_value,
  count(*) filter (
    where stock_qty <= p.low_stock_threshold and p.is_archived = false
  )::integer as low_stock_count,
  count(*) filter (where p.is_archived = false)::integer as active_products
from public.v_product_stock_costs c
join public.products p on p.id = c.product_id;

create or replace view public.v_inventory_summary_public as
select
  coalesce(sum(stock_qty), 0)::integer as total_units,
  count(*) filter (where is_low_stock)::integer as low_stock_count,
  count(*) filter (where is_archived = false)::integer as active_products
from public.v_product_stock;

-- ============================================================================
-- Privileges
--
-- v_product_stock and v_inventory_summary_public run with definer rights (they
-- aggregate batch_items for stock counts), so they bypass RLS. Anonymous
-- visitors must never read them. Every other view is invoker-secured, but we
-- still grant explicitly instead of relying on Supabase default privileges.
-- ============================================================================

revoke all on
  public.v_product_stock,
  public.v_product_stock_costs,
  public.v_batch_summary,
  public.v_sale_balances,
  public.v_customer_balances,
  public.v_inventory_value,
  public.v_inventory_summary_public
from anon;

grant select on
  public.v_product_stock,
  public.v_product_stock_costs,
  public.v_batch_summary,
  public.v_sale_balances,
  public.v_customer_balances,
  public.v_inventory_value,
  public.v_inventory_summary_public
to authenticated;
