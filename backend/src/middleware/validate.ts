import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../lib/errors";

export type ValidateSource = "body" | "query" | "params";

export function validate(schema: ZodTypeAny, source: ValidateSource = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        new ApiError(
          422,
          "VALIDATION_ERROR",
          "Please check the highlighted fields.",
          result.error.flatten(),
        ),
      );
      return;
    }

    req.validated = { ...(req.validated ?? {}), [source]: result.data };
    next();
  };
}

export function validated<T>(req: { validated?: Record<string, unknown> }, source: ValidateSource): T {
  return req.validated?.[source] as T;
}
