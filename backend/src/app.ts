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

  // The frontend and API share one origin in production (Vercel services
  // routing), but browsers still attach an Origin header to same-origin
  // POST/PATCH/DELETE requests. Treat those as same-origin so they are not
  // rejected by the CORS allowlist; genuinely cross-origin requests still go
  // through the CORS_ORIGIN check below.
  app.use((req, _res, next) => {
    const origin = req.headers.origin;
    if (origin && req.headers.host) {
      try {
        if (new URL(origin).host === req.headers.host) {
          delete req.headers.origin;
        }
      } catch {
        // Malformed Origin header: leave it for the CORS check to reject.
      }
    }
    next();
  });

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
