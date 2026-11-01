import { z } from "zod";

const uuid = z.string().uuid();
const money = z.coerce
  .number({ invalid_type_error: "Must be a number" })
  .min(0, "Cannot be negative")
  .max(9_999_999_999.99, "Amount is too large");
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().min(0);
const optionalText = z
  .union([z.string().trim().max(1000), z.null()])
  .optional();

export const isoDate = z.string().datetime({ offset: true });
export const dateRangeSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const idParamSchema = z.object({ id: uuid });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/* ------------------------------------------------------------------ users */

export const inviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(["manager", "cashier"]).optional(),
  phone: optionalText,
});

export const updateUserSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["owner", "manager", "cashier"]).optional(),
    is_active: z.boolean().optional(),
    phone: optionalText,
  })
  .refine((v) => Object.keys(v).length > 0, "No changes supplied");

/* --------------------------------------------------------------- branding */

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const archiveProductSchema = z.object({
  archived: z.boolean(),
});

/* --------------------------------------------------------------- products */

export const productSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  barcode: optionalText,
  name: z.string().trim().min(1).max(160),
  brand_id: uuid.optional().nullable(),
  flavor: z.string().trim().min(1).max(120),
  nicotine_strength: optionalText,
  selling_price: money,
  low_stock_threshold: nonNegativeInt.optional(),
  notes: optionalText,
});

export const productUpdateSchema = productSchema.partial();

const queryBoolean = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true")
  .optional();

export const inventoryQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  lowStock: queryBoolean,
  archived: queryBoolean,
});

/* -------------------------------------------------------------- suppliers */

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contact_person: optionalText,
  phone: optionalText,
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  address: optionalText,
  notes: optionalText,
  is_active: z.boolean().optional(),
});

export const supplierUpdateSchema = supplierSchema.partial();

/* ---------------------------------------------------------------- batches */

export const batchItemSchema = z.object({
  product_id: uuid,
  quantity_received: positiveInt,
  supplier_price: money,
  selling_price: money,
});

export const batchSchema = z.object({
  batch_number: z.string().trim().min(1).max(64),
  supplier_id: uuid.optional().nullable(),
  date_received: z.string().min(10).max(10),
  notes: optionalText,
  items: z.array(batchItemSchema).min(1, "A batch needs at least one product"),
});

export const adjustStockSchema = z.object({
  batch_item_id: uuid,
  quantity_delta: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, "Adjustment cannot be zero"),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

/* -------------------------------------------------------------- customers */

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  is_active: z.boolean().optional(),
});

export const customerUpdateSchema = customerSchema.partial();

/* ------------------------------------------------------------------ sales */

export const saleItemInputSchema = z.object({
  product_id: uuid,
  quantity: positiveInt.max(10_000),
  batch_item_id: uuid.optional().nullable(),
});

export const salePaymentInputSchema = z.object({
  method: z.enum(["cash", "gcash", "bank_transfer", "other"]),
  amount: money,
  reference_no: optionalText,
});

export const createSaleSchema = z.object({
  source: z.enum(["pos", "manual"]).optional(),
  customer_id: uuid.optional().nullable(),
  customer_name: z.string().trim().max(160).optional().nullable(),
  notes: optionalText,
  discount: money.optional(),
  items: z.array(saleItemInputSchema).min(1, "Add at least one product"),
  payment: salePaymentInputSchema.optional(),
  idempotency_key: z.string().trim().min(8).max(100).optional(),
  sale_date: isoDate.optional(),
});

export const addPaymentSchema = z.object({
  amount: money.refine((v) => v > 0, "Amount must be greater than zero"),
  method: z.enum(["cash", "gcash", "bank_transfer", "other"]),
  reference_no: optionalText,
  notes: optionalText,
});

export const voidSaleSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const updateSaleSchema = z
  .object({
    customer_id: uuid.optional().nullable(),
    customer_name: z.string().trim().max(160).optional().nullable(),
    notes: optionalText,
  })
  .refine((v) => Object.keys(v).length > 0, "No changes supplied");

export const editSaleSchema = createSaleSchema.omit({ idempotency_key: true }).extend({
  reason: z.string().trim().min(3).max(500),
});

export const salesQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  customer_id: uuid.optional(),
  product_id: uuid.optional(),
  cashier_id: uuid.optional(),
  status: z.enum(["completed", "voided"]).optional(),
  payment_status: z.enum(["unpaid", "partial", "paid"]).optional(),
  source: z.enum(["pos", "manual"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/* --------------------------------------------------------------- settings */

export const settingsSchema = z.object({
  store_name: z.string().trim().min(1).max(160),
  address: optionalText,
  phone: optionalText,
  receipt_footer: optionalText,
  default_low_stock: nonNegativeInt,
});

/* ---------------------------------------------------------------- reports */

export const reportQuerySchema = dateRangeSchema.extend({
  granularity: z.enum(["day", "week", "month", "year"]).default("day"),
});

export const exportQuerySchema = dateRangeSchema.extend({
  granularity: z.enum(["day", "week", "month", "year"]).default("day"),
  format: z.enum(["json", "csv", "xlsx"]).default("json"),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type BatchInput = z.infer<typeof batchSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type AddPaymentInput = z.infer<typeof addPaymentSchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
