-- ============================================================================
-- 0009 — Fix item_count in v_sale_balances
--
-- v_sale_balances used a correlated subquery over the base sale_items table.
-- Since sale_items is now accessed through the cost-masking views, the
-- subquery must read v_sale_items so it works for cashiers without exposing
-- the base table to the role that owns the view (invoker security).
-- ============================================================================

create or replace view public.v_sale_balances
with (security_invoker = true)
as
select
  s.*,
  (s.total - s.paid_amount)::numeric(14, 2) as balance,
  (
    select coalesce(sum(si.quantity), 0)::integer
      from public.v_sale_items si
     where si.sale_id = s.id
  ) as item_count
from public.sales s;

revoke all on public.v_sale_balances from anon;
grant select on public.v_sale_balances to authenticated;
