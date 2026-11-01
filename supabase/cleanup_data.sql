-- Clean all business data while keeping auth accounts and database functions.
begin;

-- Append-only guards block deletes by design; cleanup needs to bypass them.
set local session_replication_role = replica;

delete from public.stock_movements;
delete from public.sale_item_allocations;
delete from public.sale_items;
delete from public.payments;
delete from public.sales;
delete from public.batch_items;
delete from public.batches;
delete from public.products;
delete from public.suppliers;
delete from public.customers;
delete from public.audit_logs;

select setval('public.sale_number_seq', 1, false);

commit;
