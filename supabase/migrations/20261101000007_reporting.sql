-- ============================================================================
-- 0007 — Reporting functions
-- Voided sales are excluded everywhere.
-- Dates are bucketed in Asia/Manila, not UTC.
-- ============================================================================

/* ------------------------------------------------------------ best_sellers */

create or replace function public.best_sellers(
  p_from  timestamptz default (now() - interval '30 days'),
  p_to    timestamptz default now(),
  p_limit integer default 10
)
returns table (
  rank          bigint,
  product_id    uuid,
  product_name  text,
  brand         text,
  flavor        text,
  quantity_sold bigint,
  revenue       numeric,
  gross_profit  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with sales_in_range as (
    select si.product_id,
           sum(si.quantity)::bigint as quantity_sold,
           sum(si.line_total)::numeric(14, 2) as revenue,
           sum(si.line_total - (si.quantity * si.unit_cost))::numeric(14, 2) as gross_profit
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
     where s.status = 'completed'
       and s.sale_date >= p_from
       and s.sale_date < p_to
     group by si.product_id
  )
  select row_number() over (
           order by r.quantity_sold desc, r.revenue desc, p.name
         )::bigint as rank,
         p.id,
         p.name,
         coalesce(b.name, ''),
         p.flavor,
         r.quantity_sold,
         r.revenue,
         r.gross_profit
    from sales_in_range r
    join public.products p on p.id = r.product_id
    left join public.brands b on b.id = p.brand_id
   order by rank
   limit greatest(coalesce(p_limit, 10), 1);
$$;

/* --------------------------------------------------------- sales report */

create or replace function public.sales_report(
  p_from        timestamptz default (now() - interval '30 days'),
  p_to          timestamptz default now(),
  p_granularity text default 'day'
)
returns table (
  period            date,
  transaction_count bigint,
  gross_sales       numeric,
  collected         numeric,
  gross_profit      numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trunc text;
begin
  v_trunc := case lower(coalesce(p_granularity, 'day'))
               when 'day' then 'day'
               when 'week' then 'week'
               when 'month' then 'month'
               when 'year' then 'year'
               else 'day'
             end;

  return query execute format($q$
    with buckets as (
      select date_trunc(%L, s.sale_date at time zone 'Asia/Manila')::date as period,
             count(*)::bigint as transaction_count,
             coalesce(sum(s.total), 0)::numeric(14, 2) as gross_sales,
             coalesce(sum(s.paid_amount), 0)::numeric(14, 2) as collected,
             coalesce(sum(s.total - s.paid_amount), 0)::numeric(14, 2) as outstanding
        from public.sales s
       where s.status = 'completed'
         and s.sale_date >= $1
         and s.sale_date < $2
       group by 1
    ),
    profit as (
      select date_trunc(%L, s.sale_date at time zone 'Asia/Manila')::date as period,
             coalesce(sum(si.line_total - (si.quantity * si.unit_cost)), 0)::numeric(14, 2) as gross_profit
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
       where s.status = 'completed'
         and s.sale_date >= $1
         and s.sale_date < $2
       group by 1
    )
    select b.period, b.transaction_count, b.gross_sales, b.collected,
           coalesce(pr.gross_profit, 0)::numeric(14, 2) as gross_profit
      from buckets b
      left join profit pr on pr.period = b.period
     order by b.period
  $q$, v_trunc, v_trunc) using p_from, p_to;
end;
$$;

/* ------------------------------------------------------- dashboard metrics */

create or replace function public.dashboard_metrics(
  p_from timestamptz default (now() - interval '30 days'),
  p_to   timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'total_products', (
      select count(*) from public.products where is_archived = false
    ),
    'available_units', (
      select coalesce(sum(stock_qty), 0) from public.v_product_stock where is_archived = false
    ),
    'low_stock_count', (
      select count(*) from public.v_product_stock where is_low_stock
    ),
    'gross_sales', (
      select coalesce(sum(total), 0) from public.sales
       where status = 'completed' and sale_date >= p_from and sale_date < p_to
    ),
    'collected', (
      select coalesce(sum(paid_amount), 0) from public.sales
       where status = 'completed' and sale_date >= p_from and sale_date < p_to
    ),
    'outstanding', (
      select coalesce(sum(total - paid_amount), 0) from public.sales
       where status = 'completed'
    ),
    'gross_profit', (
      select coalesce(sum(si.line_total - (si.quantity * si.unit_cost)), 0)
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
       where s.status = 'completed' and s.sale_date >= p_from and s.sale_date < p_to
    ),
    'transaction_count', (
      select count(*) from public.sales
       where status = 'completed' and sale_date >= p_from and sale_date < p_to
    )
  ) into v_result;

  return v_result;
end;
$$;

/* ------------------------------------------------------- outstanding report */

create or replace function public.outstanding_report()
returns table (
  sale_id            uuid,
  transaction_number text,
  sale_date          timestamptz,
  customer_id        uuid,
  customer_name      text,
  cashier_name       text,
  total              numeric,
  paid_amount        numeric,
  balance            numeric,
  payment_status     public.payment_status
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         s.transaction_number,
         s.sale_date,
         s.customer_id,
         coalesce(c.name, s.customer_name, 'Walk-in'),
         p.full_name,
         s.total,
         s.paid_amount,
         (s.total - s.paid_amount)::numeric(14, 2) as balance,
         s.payment_status
    from public.sales s
    left join public.customers c on c.id = s.customer_id
    left join public.profiles p on p.id = s.cashier_id
   where s.status = 'completed'
     and s.total > s.paid_amount
   order by s.sale_date asc;
$$;

/* ---------------------------------------------------- cashier performance */

create or replace function public.cashier_performance(
  p_from timestamptz default (now() - interval '30 days'),
  p_to   timestamptz default now()
)
returns table (
  cashier_id        uuid,
  cashier_name      text,
  transaction_count bigint,
  gross_sales       numeric,
  collected         numeric,
  outstanding       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.full_name,
         count(s.id)::bigint,
         coalesce(sum(s.total), 0)::numeric(14, 2),
         coalesce(sum(s.paid_amount), 0)::numeric(14, 2),
         coalesce(sum(s.total - s.paid_amount), 0)::numeric(14, 2)
    from public.profiles p
    left join public.sales s
      on s.cashier_id = p.id
     and s.status = 'completed'
     and s.sale_date >= p_from
     and s.sale_date < p_to
   where p.role in ('owner', 'manager', 'cashier')
   group by p.id, p.full_name
   order by gross_sales desc;
$$;

/* --------------------------------------------------------------- privileges */

revoke execute on function public.best_sellers(timestamptz, timestamptz, integer) from public, anon;
revoke execute on function public.sales_report(timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.dashboard_metrics(timestamptz, timestamptz) from public, anon;
revoke execute on function public.outstanding_report() from public, anon;
revoke execute on function public.cashier_performance(timestamptz, timestamptz) from public, anon;

grant execute on function public.best_sellers(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.sales_report(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;
grant execute on function public.outstanding_report() to authenticated;
grant execute on function public.cashier_performance(timestamptz, timestamptz) to authenticated;
