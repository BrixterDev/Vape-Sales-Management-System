import type { RequestHandler } from "express";
import type { SettingsInput } from "@vape/shared";
import { authOf } from "../middleware/auth";
import { validated } from "../middleware/validate";
import {
  getSettings,
  listAuditLogs,
  updateSettings,
} from "../services/settings.service";

export const show: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  res.json(await getSettings(auth.db));
};

export const update: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const body = validated<SettingsInput>(req, "body");
  res.json(await updateSettings(auth.db, body));
};

export const auditLogs: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 50);

  res.json(
    await listAuditLogs(auth.db, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 50,
      table: typeof req.query.table === "string" ? req.query.table : undefined,
      action: typeof req.query.action === "string" ? req.query.action : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
    }),
  );
};
