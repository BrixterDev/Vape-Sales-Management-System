-- ============================================================================
-- 0003 — Row Level Security
--
-- Model:
--   * All transactional writes (sales, payments, stock) go through SECURITY
--     DEFINER RPCs, which bypass RLS after performing their own role checks.
--   * Direct INSERT/UPDATE on transactional tables is therefore denied to API
--     clients; only the RPCs can mutate them.
--   * Master data is writable by owners/managers through RLS policies.
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.brands                enable row level security;
alter table public.products              enable row level security;
alter table public.suppliers             enable row level security;
alter table public.batches               enable row level security;
alter table public.batch_items           enable row level security;
alter table public.customers             enable row level security;
alter table public.sales                 enable row level security;
alter table public.sale_items            enable row level security;
alter table public.sale_item_allocations enable row level security;
alter table public.payments              enable row level security;
alter table public.stock_movements       enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.idempotency_keys      enable row level security;
alter table public.settings              enable row level security;

create or replace function public.can_view_sale(p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.sales s
     where s.id = p_sale_id
       and (
         public.current_user_role() in ('owner', 'manager')
         or s.cashier_id = auth.uid()
       )
  );
$$;

/* ---------------------------------------------------------------- profiles */

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_user_role() in ('owner', 'manager'));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

/* ------------------------------------------------------- master data (R/W) */

create policy brands_select on public.brands
  for select to authenticated using (true);
create policy brands_insert on public.brands
  for insert to authenticated with check (public.is_manager_or_owner());
create policy brands_update on public.brands
  for update to authenticated
  using (public.is_manager_or_owner())
  with check (public.is_manager_or_owner());

create policy products_select on public.products
  for select to authenticated using (true);
create policy products_insert on public.products
  for insert to authenticated with check (public.is_manager_or_owner());
create policy products_update on public.products
  for update to authenticated
  using (public.is_manager_or_owner())
  with check (public.is_manager_or_owner());

create policy suppliers_select on public.suppliers
  for select to authenticated using (public.is_manager_or_owner());
create policy suppliers_insert on public.suppliers
  for insert to authenticated with check (public.is_manager_or_owner());
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (public.is_manager_or_owner())
  with check (public.is_manager_or_owner());

create policy customers_select on public.customers
  for select to authenticated using (true);
create policy customers_insert on public.customers
  for insert to authenticated with check (public.is_manager_or_owner());
create policy customers_update on public.customers
  for update to authenticated
  using (public.is_manager_or_owner())
  with check (public.is_manager_or_owner());

create policy batches_select on public.batches
  for select to authenticated using (public.is_manager_or_owner());
create policy batches_insert on public.batches
  for insert to authenticated with check (public.is_manager_or_owner());
create policy batches_update on public.batches
  for update to authenticated
  using (public.is_manager_or_owner())
  with check (public.is_manager_or_owner());

create policy batch_items_select on public.batch_items
  for select to authenticated using (public.is_manager_or_owner());
create policy batch_items_insert on public.batch_items
  for insert to authenticated with check (public.is_manager_or_owner());
create policy batch_items_update on public.batch_items
  for update to authenticated
  using (public.is_manager_or_owner())
  with check (public.is_manager_or_owner());

/* ------------------------------------------------- transaction history (R) */

create policy sales_select on public.sales
  for select to authenticated
  using (
    public.current_user_role() in ('owner', 'manager')
    or cashier_id = auth.uid()
  );

create policy sale_items_select on public.sale_items
  for select to authenticated
  using (public.can_view_sale(sale_id));

create policy sale_allocations_select on public.sale_item_allocations
  for select to authenticated
  using (
    exists (
      select 1 from public.sale_items si
       where si.id = sale_item_id
         and public.can_view_sale(si.sale_id)
    )
  );

create policy payments_select on public.payments
  for select to authenticated
  using (public.can_view_sale(sale_id));

create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (
    public.current_user_role() in ('owner', 'manager')
    or (
      sale_id is not null
      and exists (
        select 1 from public.sales s
         where s.id = sale_id and s.cashier_id = auth.uid()
      )
    )
  );

/* ---------------------------------------------------------------- audit/etc */

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.current_user_role() = 'owner');

create policy idempotency_keys_select on public.idempotency_keys
  for select to authenticated
  using (user_id = auth.uid());

create policy settings_select on public.settings
  for select to authenticated using (true);
create policy settings_update on public.settings
  for update to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

/* ------------------------------------------------------------ lock down RPCs */

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.write_audit_log() from public, anon, authenticated;
revoke execute on function public.prevent_delete() from public, anon, authenticated;
revoke execute on function public.guard_profile_privileges() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
