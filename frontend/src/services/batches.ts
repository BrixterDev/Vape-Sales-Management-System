import type { Batch, BatchInput, BatchItem, BatchSummary } from "@vape/shared";
import { api } from "@/lib/api";
import type { Paginated } from "./products";

export interface BatchDetail extends Batch {
  supplier_id: string | null;
  suppliers: { name: string } | null;
  profiles: { full_name: string } | null;
  items: Array<
    BatchItem & {
      products: {
        sku: string;
        name: string;
        flavor: string;
        brands: { name: string } | null;
      } | null;
    }
  >;
  totals: {
    totalCost: number;
    remainingCost: number;
    potentialRevenue: number;
    potentialProfit: number;
    remainingRetail: number;
    remainingUnits: number;
    totalUnits: number;
  };
}

export const batchesService = {
  list: (params: {
    page: number;
    pageSize: number;
    search?: string;
    supplier_id?: string;
    from?: string;
    to?: string;
  }) => api.get<Paginated<BatchSummary>>("/batches", params),

  get: (id: string) => api.get<BatchDetail>(`/batches/${id}`),

  remove: (id: string) =>
    api.del<{
      batch_id: string;
      batch_number: string;
      items_deleted: number;
      units_written_off: number;
    }>(`/batches/${id}`),

  create: (input: BatchInput) =>
    api.post<{ batch_id: string; batch_number: string; item_count: number }>(
      "/batches",
      input,
    ),
};
