import type { CreateSaleResult, Settings } from "@vape/shared";
import { formatDateTime, formatPHP } from "@/lib/utils";

export type ReceiptPaymentMethod = "cash" | "gcash" | "bank_transfer" | "other";

const METHOD_LABEL: Record<ReceiptPaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

export interface SaleReceiptProps {
  receipt: CreateSaleResult;
  settings?: Settings | null;
  cashierName?: string | null;
  method?: ReceiptPaymentMethod;
  reference?: string | null;
  /** Cash handed over minus the total, when it is known. */
  change?: number;
}

/**
 * Thermal receipt layout shared by the on-screen preview and the print-only
 * copy. Styling lives in `index.css` (`.receipt*`) so printing is black on
 * white regardless of the app theme.
 */
export function SaleReceipt({
  receipt,
  settings,
  cashierName,
  method,
  reference,
  change,
}: SaleReceiptProps) {
  const brandLine = [receipt.source === "pos" ? "POS" : "Manual", method ? METHOD_LABEL[method] : null]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <div className="receipt">
      <div className="receipt__center">
        <p className="receipt__store">{settings?.store_name ?? "Vape Store"}</p>
        {settings?.address ? <p className="receipt__small">{settings.address}</p> : null}
        {settings?.phone ? <p className="receipt__small">{settings.phone}</p> : null}
      </div>

      <div className="receipt__divider" />

      <div className="receipt__row">
        <span>Receipt</span>
        <span>{receipt.transaction_number}</span>
      </div>
      <div className="receipt__row">
        <span>Date</span>
        <span>{formatDateTime(receipt.sale_date)}</span>
      </div>
      {cashierName ? (
        <div className="receipt__row">
          <span>Cashier</span>
          <span>{cashierName}</span>
        </div>
      ) : null}
      <div className="receipt__row">
        <span>Customer</span>
        <span>{receipt.customer_name || "Walk-in"}</span>
      </div>

      <div className="receipt__divider" />

      <div className="receipt__items">
        {receipt.items.map((item) => (
          <div key={`${item.product_id}-${item.flavor}`} className="receipt__item">
            <div className="receipt__item-name">
              <div>{item.product_name}</div>
              <div className="receipt__small receipt__muted">
                {[item.brand_name, item.flavor].filter(Boolean).join(" \u00b7 ")}
              </div>
              <div className="receipt__small receipt__muted">
                {item.quantity} x {formatPHP(item.unit_price)}
              </div>
            </div>
            <div className="receipt__item-amount">{formatPHP(item.line_total)}</div>
          </div>
        ))}
      </div>

      <div className="receipt__divider" />

      <div className="receipt__row">
        <span>Subtotal</span>
        <span>{formatPHP(receipt.subtotal)}</span>
      </div>
      {Number(receipt.discount) > 0 ? (
        <div className="receipt__row">
          <span>Discount</span>
          <span>-{formatPHP(receipt.discount)}</span>
        </div>
      ) : null}
      <div className="receipt__row receipt__total">
        <span>Total</span>
        <span>{formatPHP(receipt.total)}</span>
      </div>
      <div className="receipt__row">
        <span>Paid</span>
        <span>{formatPHP(receipt.paid_amount)}</span>
      </div>
      {change !== undefined && change > 0 ? (
        <div className="receipt__row">
          <span>Change</span>
          <span>{formatPHP(change)}</span>
        </div>
      ) : null}
      {Number(receipt.balance) > 0 ? (
        <div className="receipt__row">
          <span>Balance</span>
          <span>{formatPHP(receipt.balance)}</span>
        </div>
      ) : null}

      <div className="receipt__divider" />

      <div className="receipt__row">
        <span>Payment</span>
        <span>{brandLine}</span>
      </div>
      {reference ? (
        <div className="receipt__row">
          <span>Ref.</span>
          <span>{reference}</span>
        </div>
      ) : null}

      <div className="receipt__footer">
        {settings?.receipt_footer ? <p>{settings.receipt_footer}</p> : null}
        <p>Thank you!</p>
      </div>
    </div>
  );
}
