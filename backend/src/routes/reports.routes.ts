import { Router } from "express";
import { requireRole } from "../middleware/auth";
import * as controller from "../controllers/reports.controller";

export const reportsRouter = Router();

reportsRouter.use(requireRole("owner", "manager"));

reportsRouter.get("/sales", controller.sales);
reportsRouter.get("/outstanding", controller.balances);
reportsRouter.get("/cashiers", controller.cashiers);
reportsRouter.get("/inventory", controller.inventory);
reportsRouter.get("/batches", controller.batches);
reportsRouter.get("/profit", controller.profit);
