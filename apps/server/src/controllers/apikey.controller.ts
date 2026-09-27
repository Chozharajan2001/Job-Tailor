import { Request, Response } from "express";
import { ApiKey } from "../models/ApiKey.model.js";
import { generateApiKey } from "../utils/api-key.js";
import { auditLogger } from "../services/audit-logger.service.js";

function clientMeta(req: Request): { ip: string; userAgent: string } {
  return {
    ip: req.ip ?? "unknown",
    userAgent: String(req.headers?.["user-agent"] ?? "unknown"),
  };
}

/**
 * POST /api/v1/apikeys
 * Body: { name: string }
 * Response 201: { key, id, prefix, name, createdAt }  // raw shown once
 */
export async function issueApiKey(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const name = String(req.body?.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_KEY_NAME", message: "name required, 1-80 chars" },
    });
    return;
  }
  const { raw, hash, prefix } = generateApiKey();
  const doc = await ApiKey.create({ userId, name, keyHash: hash, prefix });
  // Audit the issuance — prefix and id only, never the raw key.
  auditLogger.apiKeyIssued({
    userId,
    keyId: String(doc._id),
    prefix,
    name,
    ...clientMeta(req),
  });
  res.status(201).json({
    success: true,
    data: {
      key: raw, // shown exactly once — never returned by list
      id: doc._id,
      prefix,
      name,
      createdAt: doc.createdAt,
    },
  });
}

/**
 * GET /api/v1/apikeys
 * Response 200: { keys: [{ id, name, prefix, lastUsedAt, revokedAt, createdAt }] }
 */
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const rows = await ApiKey.find({ userId })
    .select("name prefix lastUsedAt revokedAt createdAt")
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    success: true,
    data: {
      keys: rows.map((r) => ({
        id: r._id,
        name: r.name,
        prefix: r.prefix,
        lastUsedAt: r.lastUsedAt ?? null,
        revokedAt: r.revokedAt ?? null,
        createdAt: r.createdAt,
      })),
    },
  });
}

/**
 * PATCH /api/v1/apikeys/:id/revoke
 * Soft-deletes by setting revokedAt (idempotent).
 */
export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;
  const doc = await ApiKey.findOne({ _id: id, userId });
  if (!doc) {
    res.status(404).json({
      success: false,
      error: { code: "API_KEY_NOT_FOUND" },
    });
    return;
  }
  if (!doc.revokedAt) {
    doc.revokedAt = new Date();
    await doc.save();
  }
  auditLogger.apiKeyRevoked({
    userId,
    keyId: String(doc._id),
    prefix: doc.prefix,
    ...clientMeta(req),
  });
  res.json({
    success: true,
    data: { id: doc._id, revokedAt: doc.revokedAt },
  });
}
