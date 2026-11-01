import type { RequestHandler } from "express";
import type { BatchInput } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { ApiError } from "../lib/errors";
import { createBatch, getBatch, listBatches } from "../services/batches.service";

export const index: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const q = validated<{
    page: number;
    pageSize: number;
    search?: string;
    supplier_id?: string;
    from?: string;
    to?: string;
  }>(req, "query");

  res.json(
    await listBatches(auth.db, {
      page: q.page,
      pageSize: q.pageSize,
      search: q.search,
      supplierId: q.supplier_id,
      from: q.from,
      to: q.to,
    }),
  );
};

export const show: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const batch = await getBatch(auth.db, req.params.id as string);
  if (!batch) throw ApiError.notFound("Batch not found");
  res.json(batch);
};

export const store: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<BatchInput>(req, "body");
  res.status(201).json(await createBatch(auth.db, body));
};
