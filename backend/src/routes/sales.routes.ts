import { Router } from "express";
import {
  addPaymentSchema,
  createSaleSchema,
  editSaleSchema,
  salesQuerySchema,
  updateSaleSchema,
  voidSaleSchema,
} from "@vape/shared";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { writeLimiter } from "../middleware/rateLimit";
import * as controller from "../controllers/sales.controller";

export const salesRouter = Router();

salesRouter.get("/", validate(salesQuerySchema, "query"), controller.index);
salesRouter.get("/:id", controller.show);

salesRouter.post("/", writeLimiter, validate(createSaleSchema), controller.store);
salesRouter.patch(
  "/:id",
  requireRole("owner", "manager"),
  validate(updateSaleSchema),
  controller.update,
);

salesRouter.post(
  "/:id/payments",
  writeLimiter,
  validate(addPaymentSchema),
  controller.recordPayment,
);

salesRouter.post(
  "/:id/void",
  requireRole("owner", "manager"),
  validate(voidSaleSchema),
  controller.voidHandler,
);

salesRouter.patch(
  "/:id/edit",
  requireRole("owner", "manager"),
  writeLimiter,
  validate(editSaleSchema),
  controller.edit,
);
