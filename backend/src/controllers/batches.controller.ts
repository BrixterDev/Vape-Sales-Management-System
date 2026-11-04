import type { RequestHandler } from "express";
import type { BatchInput } from "@vape/shared";
import { batchArchiveSchema } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { ApiError } from "../lib/errors";
import {
  createBatch,
  getBatch,
  listBatches,
  setBatchArchived,
} from "../services/batches.service";

export const index: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const q = validated<{
    page: number;
    pageSize: number;
    search?: string;
    supplier_id?: string;
    from?: string;
    to?: string;
    archived?: boolean;
  }>(req, "query");

  res.json(
    await listBatches(auth.db, {
      page: q.page,
      pageSize: q.pageSize,
      search: q.search,
      supplierId: q.supplier_id,
      from: q.from,
      to: q.to,
      archived: q.archived,
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

export const archive: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = batchArchiveSchema.parse(req.body);
  const batch = await setBatchArchived(
    auth.db,
    req.params.id as string,
    body.archived,
    auth.profile.id,
  );
  if (!batch) throw ApiError.notFound("Batch not found");
  res.json(batch);
};
