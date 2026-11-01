-- ============================================================================
-- 0008 — Customers are name-only
--
-- The store only needs a customer name and their order history. Contact
-- details are no longer collected. Derived order metrics remain available in
-- v_customer_balances.
-- ============================================================================

drop view if exists public.v_customer_balances;

alter table public.customers
  drop column if exists phone,
  drop column if exists email,
  drop column if exists address,
  drop column if exists notes;

create view public.v_customer_balances
with (security_invoker = true)
as
select
  c.id,
  c.name,
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

revoke all on public.v_customer_balances from anon;
grant select on public.v_customer_balances to authenticated;
