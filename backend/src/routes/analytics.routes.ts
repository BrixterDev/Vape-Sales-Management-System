import { Router } from "express";
import * as controller from "../controllers/reports.controller";

export const analyticsRouter = Router();

analyticsRouter.get("/dashboard", controller.dashboard);
analyticsRouter.get("/best-sellers", controller.best);
