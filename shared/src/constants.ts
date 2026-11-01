import type {
  MovementType,
  PaymentMethod,
  PaymentStatus,
  SaleSource,
  SaleStatus,
  UserRole,
} from "./types";

export const USER_ROLES: UserRole[] = ["owner", "manager", "cashier"];
export const SALE_STATUSES: SaleStatus[] = ["completed", "voided"];
export const SALE_SOURCES: SaleSource[] = ["pos", "manual"];
export const PAYMENT_STATUSES: PaymentStatus[] = ["unpaid", "partial", "paid"];
export const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "gcash",
  "bank_transfer",
  "other",
];
export const MOVEMENT_TYPES: MovementType[] = [
  "receive",
  "sale",
  "void_return",
  "adjustment",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner / Admin",
  manager: "Manager",
  cashier: "Cashier / Staff",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receive: "Stock Received",
  sale: "Sale",
  void_return: "Void Return",
  adjustment: "Adjustment",
};

/** Permissions enforced by the API and mirrored in the UI. */
export const PERMISSIONS = {
  "dashboard.view": ["owner", "manager", "cashier"],
  "inventory.view": ["owner", "manager", "cashier"],
  "inventory.manage": ["owner", "manager"],
  "inventory.archive": ["owner", "manager"],
  "batches.view": ["owner", "manager"],
  "batches.manage": ["owner", "manager"],
  "pos.use": ["owner", "manager", "cashier"],
  "sales.view.all": ["owner", "manager"],
  "sales.view.own": ["owner", "manager", "cashier"],
  "sales.void": ["owner", "manager"],
  "sales.discount": ["owner", "manager"],
  "payments.record": ["owner", "manager", "cashier"],
  "customers.manage": ["owner", "manager"],
  "suppliers.manage": ["owner", "manager"],
  "best_sellers.view": ["owner", "manager", "cashier"],
  "reports.view": ["owner", "manager"],
  "users.manage": ["owner"],
  "settings.manage": ["owner"],
  "audit.view": ["owner"],
} satisfies Record<string, UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

export const CURRENCY = "PHP";
export const CURRENCY_SYMBOL = "\u20B1";
export const TIMEZONE = "Asia/Manila";
