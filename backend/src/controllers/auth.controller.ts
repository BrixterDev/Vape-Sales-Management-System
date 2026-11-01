import type { RequestHandler } from "express";
import { authOf } from "../middleware/auth";
import { fail } from "../lib/db";

export const me: RequestHandler = async (req, res) => {
  const { profile, user } = authOf(req);
  res.json({
    id: profile.id,
    email: user.email ?? null,
    full_name: profile.full_name,
    role: profile.role,
    is_active: profile.is_active,
    phone: profile.phone,
  });
};

export const updateMe: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = (req.validated?.body ?? {}) as { full_name?: string; phone?: string | null };

  const { data, error } = await auth.db
    .from("profiles")
    .update(body)
    .eq("id", auth.profile.id)
    .select()
    .maybeSingle();

  if (error) fail(error, "Unable to update your profile");
  res.json(data);
};
