import { Router } from "express";
import { inviteUserSchema, updateUserSchema } from "@vape/shared";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as controller from "../controllers/users.controller";

export const usersRouter = Router();

usersRouter.use(requireRole("owner"));

usersRouter.get("/", controller.index);
usersRouter.post("/", validate(inviteUserSchema), controller.store);
usersRouter.patch("/:id", validate(updateUserSchema), controller.update);
usersRouter.post("/:id/deactivate", controller.deactivate);
