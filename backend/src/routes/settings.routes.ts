import { Router } from "express";
import { settingsSchema } from "@vape/shared";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as controller from "../controllers/settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/", controller.show);
settingsRouter.patch("/", requireRole("owner"), validate(settingsSchema), controller.update);
settingsRouter.get("/audit-logs", requireRole("owner"), controller.auditLogs);
