import type { RequestHandler } from "express";
import type { InviteUserInput, UpdateUserInput } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import { ApiError } from "../lib/errors";
import {
  createUser,
  deactivateUser,
  listUsers,
  updateUser,
} from "../services/users.service";

export const index: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  res.json(await listUsers(auth.db));
};

export const store: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<InviteUserInput>(req, "body");
  res.status(201).json(await createUser(auth.db, body));
};

export const update: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<UpdateUserInput>(req, "body");

  if (req.params.id === auth.profile.id) {
    if (body.role && body.role !== auth.profile.role) {
      throw ApiError.forbidden("You cannot change your own role");
    }
    if (body.is_active === false) {
      throw ApiError.forbidden("You cannot deactivate your own account");
    }
  }

  const user = await updateUser(auth.db, req.params.id as string, body);
  if (!user) throw ApiError.notFound("User not found");
  res.json(user);
};

export const deactivate: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  if (req.params.id === auth.profile.id) {
    throw ApiError.forbidden("You cannot deactivate your own account");
  }
  const user = await deactivateUser(auth.db, req.params.id as string);
  if (!user) throw ApiError.notFound("User not found");
  res.json(user);
};
