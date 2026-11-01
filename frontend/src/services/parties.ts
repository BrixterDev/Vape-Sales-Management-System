import type {
  Customer,
  CustomerBalance,
  SaleWithBalance,
  Supplier,
  SupplierInput,
  CustomerInput,
} from "@vape/shared";
import { api } from "@/lib/api";
import type { Paginated } from "./products";

export const suppliersService = {
  list: (params: { page: number; pageSize: number; search?: string }) =>
    api.get<Paginated<Supplier>>("/suppliers", params),

  create: (input: SupplierInput) => api.post<Supplier>("/suppliers", input),

  update: (id: string, input: Partial<SupplierInput>) =>
    api.patch<Supplier>(`/suppliers/${id}`, input),

  batches: (id: string) =>
    api.get<Array<Record<string, unknown>>>(`/suppliers/${id}/batches`),
};

export const customersService = {
  list: (params: { page: number; pageSize: number; search?: string }) =>
    api.get<Paginated<CustomerBalance>>("/customers", params),

  get: (id: string) => api.get<CustomerBalance>(`/customers/${id}`),

  transactions: (id: string) =>
    api.get<SaleWithBalance[]>(`/customers/${id}/transactions`),

  create: (input: CustomerInput) => api.post<Customer>("/customers", input),

  update: (id: string, input: Partial<CustomerInput>) =>
    api.patch<Customer>(`/customers/${id}`, input),
};
