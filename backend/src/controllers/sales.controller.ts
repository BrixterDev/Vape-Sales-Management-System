import type { RequestHandler } from "express";
import type { AddPaymentInput, CreateSaleInput, UpdateSaleInput } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { ApiError } from "../lib/errors";
import {
  addPayment,
  createSale,
  getSale,
  listSales,
  redactCost,
  updateSaleDetails,
  voidSale,
} from "../services/sales.service";

interface SalesQuery {
  page: number;
  pageSize: number;
  search?: string;
  customer_id?: string;
  product_id?: string;
  cashier_id?: string;
  status?: "completed" | "voided";
  payment_status?: "unpaid" | "partial" | "paid";
  source?: "pos" | "manual";
  from?: string;
  to?: string;
}

export const index: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const q = validated<SalesQuery>(req, "query");

  // Cashiers only ever see their own transactions, regardless of filters.
  const cashierId =
    auth.profile.role === "cashier" ? auth.profile.id : q.cashier_id;

  res.json(
    await listSales(auth.db, {
      page: q.page,
      pageSize: q.pageSize,
      search: q.search,
      customerId: q.customer_id,
      productId: q.product_id,
      cashierId,
      status: q.status,
      paymentStatus: q.payment_status,
      source: q.source,
      from: q.from,
      to: q.to,
    }),
  );
};

export const show: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const includeCost = auth.profile.role !== "cashier";
  const sale = await getSale(auth.db, req.params.id as string, includeCost);
  if (!sale) throw ApiError.notFound("Sale not found");
  res.json(sale);
};

export const store: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<CreateSaleInput>(req, "body");

  if (body.source === "manual" && auth.profile.role === "cashier") {
    throw ApiError.forbidden("Cashiers cannot record manual sales");
  }

  const sale = await createSale(auth.db, body);
  res
    .status(201)
    .json(auth.profile.role === "cashier" ? redactCost(sale as { items?: unknown }) : sale);
};

export const recordPayment: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<AddPaymentInput>(req, "body");
  res.status(201).json(await addPayment(auth.db, req.params.id as string, body));
};

export const voidHandler: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<{ reason: string }>(req, "body");
  res.json(await voidSale(auth.db, req.params.id as string, body.reason));
};

export const update: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<UpdateSaleInput>(req, "body");
  res.json(await updateSaleDetails(auth.db, req.params.id as string, body));
};
