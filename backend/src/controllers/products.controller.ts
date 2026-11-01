import type { RequestHandler } from "express";
import type { ProductInput, ProductUpdateInput } from "@vape/shared";
import { archiveProductSchema } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { ApiError } from "../lib/errors";
import {
  createBrand,
  createProduct,
  getProduct,
  inventorySummary,
  listBrands,
  listMovements,
  listStock,
  setArchived,
  updateProduct,
} from "../services/products.service";

interface ListQuery {
  page: number;
  pageSize: number;
  search?: string;
  lowStock?: boolean;
  archived?: boolean;
}

export const index: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const query = validated<ListQuery>(req, "query");
  const includeCost = auth.profile.role !== "cashier";
  res.json(await listStock(auth.db, { ...query, includeCost }));
};

export const show: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const includeCost = auth.profile.role !== "cashier";
  const product = await getProduct(auth.db, req.params.id as string, includeCost);
  if (!product) throw ApiError.notFound("Product not found");
  res.json(product);
};

export const store: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<ProductInput>(req, "body");
  res.status(201).json(await createProduct(auth.db, body, auth.profile.id));
};

export const update: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<ProductUpdateInput>(req, "body");
  const product = await updateProduct(auth.db, req.params.id as string, body);
  if (!product) throw ApiError.notFound("Product not found");
  res.json(product);
};

export const archive: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = archiveProductSchema.parse(req.body);
  const product = await setArchived(auth.db, req.params.id as string, body.archived);
  if (!product) throw ApiError.notFound("Product not found");
  res.json(product);
};

export const movements: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const limit = Number(req.query.limit ?? 100);
  res.json(await listMovements(auth.db, req.params.id as string, limit));
};

export const summary: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const includeCost = auth.profile.role !== "cashier";
  res.json(await inventorySummary(auth.db, includeCost));
};

export const brands: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  res.json(await listBrands(auth.db));
};

export const storeBrand: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<{ name: string }>(req, "body");
  res.status(201).json(await createBrand(auth.db, body.name));
};
