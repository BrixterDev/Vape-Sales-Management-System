-- ============================================================================
-- Seed — intentionally minimal. No sample products or transactions.
-- ============================================================================

insert into public.settings (id, store_name, address, phone, receipt_footer, default_low_stock, currency)
values (
  1,
  'Vape Store',
  null,
  null,
  'Thank you for your purchase!',
  5,
  'PHP'
)
on conflict (id) do nothing;
