-- ============================================================================
-- 0002 — Helper functions, triggers and integrity guards
-- ============================================================================

-- --------------------------------------------------------------- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------- role helpers
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.profiles
   where id = auth.uid()
     and is_active = true;
$$;

create or replace function public.assert_role(p_roles public.user_role[])
returns public.user_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select role, is_active into v_role, v_active
    from public.profiles
   where id = auth.uid();

  if v_role is null or v_active is not true then
    raise exception 'Account is inactive or missing' using errcode = '28000';
  end if;

  if not (v_role = any (p_roles)) then
    raise exception 'Insufficient permissions for this action' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

create or replace function public.is_manager_or_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('owner', 'manager'), false);
$$;

-- ------------------------------------------------------- first user = owner
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if exists (select 1 from public.profiles) then
    v_role := 'cashier';
  else
    v_role := 'owner';
  end if;

  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    v_role,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Only an owner (or the service role) may change a role or activation flag.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- service role / migrations
  end if;

  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and public.current_user_role() is distinct from 'owner' then
    raise exception 'Only an owner can change roles or account status' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
before update on public.profiles
for each row execute function public.guard_profile_privileges();

-- --------------------------------------------------------------- audit logs
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_record_id text;
begin
  v_actor := coalesce(
    auth.uid(),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );

  v_record_id := case
    when tg_op = 'DELETE' then old.id::text
    else new.id::text
  end;

  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    v_actor,
    tg_op,
    tg_table_name,
    v_record_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ------------------------------------------------------- append-only guard
create or replace function public.prevent_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rows in % are append-only; void the record instead', tg_table_name
    using errcode = '42501';
end;
$$;

-- ------------------------------------------------------------- attach triggers
create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

create trigger batch_items_set_updated_at
  before update on public.batch_items
  for each row execute function public.set_updated_at();

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- Audit trails for anything that affects money, stock or access.
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();

create trigger audit_products
  after insert or update or delete on public.products
  for each row execute function public.write_audit_log();

create trigger audit_brands
  after insert or update or delete on public.brands
  for each row execute function public.write_audit_log();

create trigger audit_suppliers
  after insert or update or delete on public.suppliers
  for each row execute function public.write_audit_log();

create trigger audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.write_audit_log();

create trigger audit_batches
  after insert or update or delete on public.batches
  for each row execute function public.write_audit_log();

create trigger audit_sales
  after insert or update or delete on public.sales
  for each row execute function public.write_audit_log();

create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();

create trigger audit_settings
  after update on public.settings
  for each row execute function public.write_audit_log();

-- Transactional history is immutable.
create trigger payments_no_delete
  before delete on public.payments
  for each row execute function public.prevent_delete();

create trigger stock_movements_no_delete
  before delete on public.stock_movements
  for each row execute function public.prevent_delete();

create trigger sale_items_no_delete
  before delete on public.sale_items
  for each row execute function public.prevent_delete();

create trigger sale_allocations_no_delete
  before delete on public.sale_item_allocations
  for each row execute function public.prevent_delete();

create trigger sales_no_delete
  before delete on public.sales
  for each row execute function public.prevent_delete();

create trigger audit_logs_no_delete
  before delete on public.audit_logs
  for each row execute function public.prevent_delete();
