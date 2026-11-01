import type { RequestHandler } from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Profile, UserRole } from "@vape/shared";
import { supabasePublic, getUserClient } from "../config/supabase";
import { ApiError } from "../lib/errors";

export interface AuthContext {
  user: User;
  profile: Profile;
  token: string;
  db: SupabaseClient;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw ApiError.unauthorized();
    }

    const token = header.slice("Bearer ".length).trim();
    const { data, error } = await supabasePublic.auth.getUser(token);

    if (error || !data.user) {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    const db = getUserClient(token);
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, full_name, role, is_active, phone, created_at, updated_at")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      throw ApiError.internal("Unable to load your profile");
    }

    if (!profile) {
      throw ApiError.forbidden("Your account has no profile yet. Contact the owner.");
    }

    if (!profile.is_active) {
      throw ApiError.forbidden("Your account has been deactivated.");
    }

    req.auth = {
      user: data.user,
      profile: profile as Profile,
      token,
      db,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.auth.profile.role)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

export function authOf(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) {
    throw ApiError.unauthorized();
  }
  return req.auth;
}
