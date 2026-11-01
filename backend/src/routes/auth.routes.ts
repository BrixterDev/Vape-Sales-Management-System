import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as controller from "../controllers/auth.controller";

const updateMeSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const authRouter = Router();

authRouter.get("/me", requireAuth, controller.me);
authRouter.patch("/me", requireAuth, validate(updateMeSchema), controller.updateMe);
