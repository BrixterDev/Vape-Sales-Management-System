import express from "express";
import cors from "cors";
import helmet from "helmet";
import type { CorsOptions } from "cors";
import { corsOrigins, isProd } from "./config/env";
import { ApiError } from "./lib/errors";
import { apiLimiter, requestLogger } from "./middleware/rateLimit";
import { errorHandler, notFound } from "./middleware/error";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new ApiError(403, "CORS_ORIGIN", `Origin ${origin} is not allowed`));
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);

  app.get("/", (_req, res) => {
    res.json({ name: "Vape Store API", version: "1.0.0", status: "ok" });
  });

  app.get("/api/v1/health", (_req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV ?? "development" });
  });

  app.use("/api/v1", apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.log("API ready");
  }

  return app;
}
