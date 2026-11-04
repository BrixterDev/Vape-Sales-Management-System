import type {
  AddPaymentInput,
  CreateSaleInput,
  CreateSaleResult,
  Payment,
  SaleDetail,
  SaleItem,
  SaleWithBalance,
  UpdateSaleInput,
} from "@vape/shared";
import { api } from "@/lib/api";
import type { Paginated } from "./products";

export interface SaleDetailResponse extends SaleDetail {
  allocations: Array<{
    sale_item_id: string;
    batch_item_id: string | null;
    quantity: number;
    unit_cost: number;
    unit_price: number;
  }>;
}

export const salesService = {
  list: (params: {
    page: number;
    pageSize: number;
    search?: string;
    customer_id?: string;
    product_id?: string;
    cashier_id?: string;
    status?: string;
    payment_status?: string;
    source?: string;
    from?: string;
    to?: string;
  }) => api.get<Paginated<SaleWithBalance>>("/sales", params),

  get: (id: string) => api.get<SaleDetailResponse>(`/sales/${id}`),

  create: (input: CreateSaleInput) =>
    api.post<CreateSaleResult>("/sales", input),

  edit: (id: string, input: CreateSaleInput) =>
    api.patch<{ sale_id: string }>(`/sales/${id}/edit`, input),

  update: (id: string, input: UpdateSaleInput) =>
    api.patch<{ sale_id: string }>(`/sales/${id}`, input),

  addPayment: (id: string, input: AddPaymentInput) =>
    api.post<{
      sale_id: string;
      paid_amount: number;
      total: number;
      balance: number;
      payment_status: string;
    }>(`/sales/${id}/payments`, input),

  void: (id: string, reason: string) =>
    api.post<{ sale_id: string; status: string }>(`/sales/${id}/void`, { reason }),
};

export type { Payment, SaleItem };
