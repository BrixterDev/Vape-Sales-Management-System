import { Router } from "express";
import { z } from "zod";
import {
  batchArchiveSchema,
  batchSchema,
  paginationSchema,
  queryBoolean,
} from "@vape/shared";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as controller from "../controllers/batches.controller";

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  supplier_id: z.string().uuid().optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  archived: queryBoolean,
});

export const batchesRouter = Router();

batchesRouter.use(requireRole("owner", "manager"));

batchesRouter.get("/", validate(listQuery, "query"), controller.index);
batchesRouter.get("/:id", controller.show);
batchesRouter.post("/", validate(batchSchema), controller.store);
batchesRouter.post(
  "/:id/archive",
  requireRole("owner"),
  validate(batchArchiveSchema),
  controller.archive,
);
