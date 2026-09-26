import { Request, Response } from "express";
import { z } from "zod";
import { pollDueSources } from "../services/source-poller.service.js";
import { seedSources, type SeedItem } from "../services/source-seed.service.js";

/**
 * Shape of a seed request. `companyId` is validated to a narrow charset so a
 * malformed token can't reach the connector fetch layer even if a future
 * refactor swaps in a URL-derived endpoint.
 */
export const seedRequestSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        connectorType: z.enum(["greenhouse", "lever", "ashby", "remoteok"]),
        companyId: z
          .string()
          .regex(
            /^[a-z0-9][a-z0-9_-]{1,50}$/,
            "companyId must be 2-51 chars: lowercase alphanumeric with - or _",
          ),
        crawlFrequency: z.number().int().min(30).max(10080).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export async function pollDueSourcesHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const summary = await pollDueSources();
  res.json({ success: true, data: summary });
}

export async function seedSourcesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = seedRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_SEED_PAYLOAD",
        message: parsed.error.issues[0]?.message ?? "Invalid payload",
        details: parsed.error.issues,
      },
    });
    return;
  }
  const items: SeedItem[] = parsed.data.items;
  const summary = await seedSources(items);
  res.status(201).json({ success: true, data: summary });
}
