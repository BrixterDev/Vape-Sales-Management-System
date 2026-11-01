import type { RequestHandler } from "express";
import type { CustomerInput, SupplierInput } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { ApiError } from "../lib/errors";
import {
  createCustomer,
  createSupplier,
  customerTransactions,
  getCustomer,
  listCustomers,
  listSuppliers,
  supplierBatches,
  updateCustomer,
  updateSupplier,
} from "../services/parties.service";

/* ---------------------------------------------------------------- suppliers */

export const supplierIndex: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const query = validated<{ page: number; pageSize: number; search?: string }>(req, "query");
  res.json(await listSuppliers(auth.db, { ...query, includeInactive: true }));
};

export const supplierStore: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<SupplierInput>(req, "body");
  res.status(201).json(await createSupplier(auth.db, body));
};

export const supplierUpdate: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<Partial<SupplierInput>>(req, "body");
  const supplier = await updateSupplier(auth.db, req.params.id as string, body);
  if (!supplier) throw ApiError.notFound("Supplier not found");
  res.json(supplier);
};

export const supplierBatchList: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  res.json(await supplierBatches(auth.db, req.params.id as string));
};

/* ---------------------------------------------------------------- customers */

export const customerIndex: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const query = validated<{ page: number; pageSize: number; search?: string }>(req, "query");
  res.json(await listCustomers(auth.db, query));
};

export const customerShow: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const customer = await getCustomer(auth.db, req.params.id as string);
  if (!customer) throw ApiError.notFound("Customer not found");
  res.json(customer);
};

export const customerTransactionsList: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  res.json(await customerTransactions(auth.db, req.params.id as string));
};

export const customerStore: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<CustomerInput>(req, "body");
  res.status(201).json(await createCustomer(auth.db, body));
};

export const customerUpdate: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<Partial<CustomerInput>>(req, "body");
  const customer = await updateCustomer(auth.db, req.params.id as string, body);
  if (!customer) throw ApiError.notFound("Customer not found");
  res.json(customer);
};
