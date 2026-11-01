import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { authRouter } from "./auth.routes";
import { analyticsRouter } from "./analytics.routes";
import { productsRouter } from "./products.routes";
import { customersRouter, suppliersRouter } from "./parties.routes";
import { batchesRouter } from "./batches.routes";
import { salesRouter } from "./sales.routes";
import { reportsRouter } from "./reports.routes";
import { usersRouter } from "./users.routes";
import { settingsRouter } from "./settings.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authLimiter, authRouter);

apiRouter.use(requireAuth);

apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/batches", batchesRouter);
apiRouter.use("/sales", salesRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/settings", settingsRouter);
