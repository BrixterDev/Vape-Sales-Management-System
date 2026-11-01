export type UserRole = "owner" | "manager" | "cashier";
export type SaleStatus = "completed" | "voided";
export type SaleSource = "pos" | "manual";
export type PaymentStatus = "unpaid" | "partial" | "paid";
export type PaymentMethod = "cash" | "gcash" | "bank_transfer" | "other";
export type MovementType = "receive" | "sale" | "void_return" | "adjustment";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand_id: string | null;
  flavor: string;
  nicotine_strength: string | null;
  selling_price: number;
  low_stock_threshold: number;
  is_archived: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductStock extends Product {
  brand: string | null;
  stock_qty: number;
  /** Null for cashiers — supplier cost is restricted. */
  stock_cost: number | null;
  retail_value: number;
  is_low_stock: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Batch {
  id: string;
  batch_number: string;
  supplier_id: string | null;
  date_received: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BatchItem {
  id: string;
  batch_id: string;
  product_id: string;
  quantity_received: number;
  remaining_quantity: number;
  supplier_price: number;
  selling_price: number;
  created_at: string;
}

export interface BatchSummary {
  batch_id: string;
  batch_number: string;
  supplier: string | null;
  date_received: string;
  item_count: number;
  total_units: number;
  remaining_units: number;
  total_cost: number;
  remaining_cost: number;
  potential_revenue: number;
  potential_profit: number;
  remaining_retail_value: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CustomerBalance extends Customer {
  transaction_count: number;
  total_purchases: number;
  outstanding: number;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  brand_name: string;
  flavor: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
}

export interface SaleItemAllocation {
  id: string;
  sale_item_id: string;
  batch_item_id: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
}

export interface Payment {
  id: string;
  sale_id: string;
  amount: number;
  method: PaymentMethod;
  reference_no: string | null;
  paid_at: string;
  received_by: string | null;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
}

export interface Sale {
  id: string;
  transaction_number: string;
  customer_id: string | null;
  customer_name: string | null;
  cashier_id: string;
  source: SaleSource;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  status: SaleStatus;
  notes: string | null;
  sale_date: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface SaleWithBalance extends Sale {
  balance: number;
  item_count: number;
}

export interface SaleDetail extends SaleWithBalance {
  cashier_name: string | null;
  items: SaleItem[];
  payments: Payment[];
}

export interface StockMovement {
  id: string;
  product_id: string;
  batch_item_id: string | null;
  type: MovementType;
  quantity_delta: number;
  sale_id: string | null;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface Settings {
  id: number;
  store_name: string;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  default_low_stock: number;
  currency: string;
  updated_at: string;
}

export interface DashboardMetrics {
  total_products: number;
  available_units: number;
  low_stock_count: number;
  gross_sales: number;
  collected: number;
  outstanding: number;
  gross_profit: number;
  transaction_count: number;
}

export interface BestSellerRow {
  rank: number;
  product_id: string;
  product_name: string;
  brand: string;
  flavor: string;
  quantity_sold: number;
  revenue: number;
  gross_profit: number;
}

export interface SalesReportRow {
  period: string;
  transaction_count: number;
  gross_sales: number;
  collected: number;
  gross_profit: number;
}

export interface CashierPerformanceRow {
  cashier_id: string;
  cashier_name: string;
  transaction_count: number;
  gross_sales: number;
  collected: number;
  outstanding: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CreateSaleResult {
  sale_id: string;
  transaction_number: string;
  customer_id: string | null;
  customer_name: string | null;
  source: SaleSource;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  balance: number;
  payment_status: PaymentStatus;
  sale_date: string;
  items: Array<{
    product_id: string;
    product_name: string;
    brand_name: string;
    flavor: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
    line_total: number;
  }>;
}
