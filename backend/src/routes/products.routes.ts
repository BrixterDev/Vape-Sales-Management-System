import { Router } from "express";
import {
  archiveProductSchema,
  brandSchema,
  inventoryQuerySchema,
  movementsQuerySchema,
  productSchema,
  productUpdateSchema,
} from "@vape/shared";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as controller from "../controllers/products.controller";

const managerOnly = requireRole("owner", "manager");

export const productsRouter = Router();

productsRouter.get("/", validate(inventoryQuerySchema, "query"), controller.index);
productsRouter.get("/summary", controller.summary);

productsRouter.get("/brands", controller.brands);
productsRouter.post("/brands", managerOnly, validate(brandSchema), controller.storeBrand);

productsRouter.get("/:id", controller.show);
productsRouter.get(
  "/:id/movements",
  validate(movementsQuerySchema, "query"),
  controller.movements,
);
productsRouter.get("/:id/batches", controller.batches);

productsRouter.post("/", managerOnly, validate(productSchema), controller.store);
productsRouter.patch("/:id", managerOnly, validate(productUpdateSchema), controller.update);
productsRouter.post(
  "/:id/archive",
  managerOnly,
  validate(archiveProductSchema),
  controller.archive,
);
