import { Router } from "express";
import { z } from "zod";
import {
  customerSchema,
  customerUpdateSchema,
  paginationSchema,
  supplierSchema,
  supplierUpdateSchema,
} from "@vape/shared";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as controller from "../controllers/parties.controller";

const managerOnly = requireRole("owner", "manager");
const listQuery = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
});

export const suppliersRouter = Router();
suppliersRouter.get("/", managerOnly, validate(listQuery, "query"), controller.supplierIndex);
suppliersRouter.post("/", managerOnly, validate(supplierSchema), controller.supplierStore);
suppliersRouter.patch(
  "/:id",
  managerOnly,
  validate(supplierUpdateSchema),
  controller.supplierUpdate,
);
suppliersRouter.get("/:id/batches", managerOnly, controller.supplierBatchList);

export const customersRouter = Router();
customersRouter.get("/", validate(listQuery, "query"), controller.customerIndex);
customersRouter.post("/", managerOnly, validate(customerSchema), controller.customerStore);
customersRouter.get("/:id", controller.customerShow);
customersRouter.get("/:id/transactions", controller.customerTransactionsList);
customersRouter.patch(
  "/:id",
  managerOnly,
  validate(customerUpdateSchema),
  controller.customerUpdate,
);
