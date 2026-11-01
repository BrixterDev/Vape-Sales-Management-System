import type { SupabaseClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import type { InviteUserInput, UpdateUserInput } from "@vape/shared";
import { getAdminClient } from "../config/supabase";
import { ApiError } from "../lib/errors";
import { fail } from "../lib/db";

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  let value = "";
  for (let i = 0; i < 14; i += 1) {
    value += alphabet[randomInt(alphabet.length)];
  }
  return `${value}Aa1!`;
}

export async function listUsers(db: SupabaseClient) {
  const admin = getAdminClient();

  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, full_name, role, is_active, phone, created_at, updated_at")
    .order("created_at");

  if (error) fail(error, "Unable to load users");

  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (authError) {
    throw ApiError.internal("Unable to load account emails");
  }

  const emails = new Map(authUsers.users.map((user) => [user.id, user.email ?? null]));

  return (profiles ?? []).map((profile) => ({
    ...profile,
    email: emails.get(profile.id) ?? null,
  }));
}

export async function createUser(db: SupabaseClient, input: InviteUserInput) {
  const admin = getAdminClient();
  const password = tempPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name,
      phone: input.phone ?? null,
    },
  });

  if (error) {
    throw new ApiError(409, "USER_EXISTS", error.message);
  }

  if (!data.user) {
    throw ApiError.internal("Unable to create the account");
  }

  const { error: profileError } = await db
    .from("profiles")
    .update({ role: input.role, full_name: input.full_name, phone: input.phone ?? null })
    .eq("id", data.user.id);

  if (profileError) {
    fail(profileError, "Account created but the profile could not be updated");
  }

  return {
    id: data.user.id,
    email: data.user.email,
    role: input.role,
    temporary_password: password,
  };
}

export async function updateUser(
  db: SupabaseClient,
  id: string,
  input: UpdateUserInput,
) {
  const { data, error } = await db
    .from("profiles")
    .update(input)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) fail(error, "Unable to update the user");
  return data;
}

export async function deactivateUser(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("profiles")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) fail(error, "Unable to deactivate the user");
  return data;
}
