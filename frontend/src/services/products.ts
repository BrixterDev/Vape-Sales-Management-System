import type {
  Brand,
  Product,
  ProductInput,
  ProductStock,
  ProductUpdateInput,
  StockMovement,
} from "@vape/shared";
import { api } from "@/lib/api";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InventorySummary {
  total_units: number;
  /** Null for cashiers — supplier cost is restricted. */
  total_cost_value: number | null;
  total_retail_value: number | null;
  low_stock_count: number;
  active_products: number;
}

export const productsService = {
  list: (params: {
    page: number;
    pageSize: number;
    search?: string;
    lowStock?: boolean;
    archived?: boolean;
  }) => api.get<Paginated<ProductStock>>("/products", params),

  get: (id: string) => api.get<ProductStock>(`/products/${id}`),

  create: (input: ProductInput) => api.post<Product>("/products", input),

  update: (id: string, input: ProductUpdateInput) =>
    api.patch<Product>(`/products/${id}`, input),

  archive: (id: string, archived: boolean) =>
    api.post<Product>(`/products/${id}/archive`, { archived }),

  movements: (id: string) =>
    api.get<StockMovement[]>(`/products/${id}/movements`),

  summary: () => api.get<InventorySummary>("/products/summary"),

  brands: () => api.get<Brand[]>("/products/brands"),

  createBrand: (name: string) => api.post<Brand>("/products/brands", { name }),
};
