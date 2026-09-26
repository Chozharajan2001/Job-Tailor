import { SourceRegistry } from "../models/SourceRegistry.model.js";
import type { SourceConnectorType } from "../models/SourceRegistry.model.js";

export interface SeedItem {
  name: string;
  connectorType: SourceConnectorType;
  companyId: string;
  /** Minutes between polls. Defaults to 360 (6 hours). */
  crawlFrequency?: number;
}

export interface SeedSummary {
  created: number;
  updated: number;
  skipped: number;
  items: Array<{ name: string; status: "created" | "updated" | "skipped" }>;
}

/**
 * Idempotent bulk-register of SourceRegistry rows for API-based connectors.
 * Matches on (connectorType, companyId): a re-run updates an existing row's
 * name and crawlFrequency without duplicating it.
 *
 * Does NOT poll on seed — that's pollDueSources' job.
 */
export async function seedSources(items: SeedItem[]): Promise<SeedSummary> {
  const summary: SeedSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    items: [],
  };

  for (const item of items) {
    if (!item.connectorType || !item.companyId || !item.name) {
      summary.skipped++;
      summary.items.push({ name: item.name, status: "skipped" });
      continue;
    }
    const existing = await SourceRegistry.findOne({
      connectorType: item.connectorType,
      companyId: item.companyId,
    });
    if (existing) {
      existing.name = item.name;
      if (item.crawlFrequency !== undefined) {
        existing.crawlFrequency = item.crawlFrequency;
      }
      await existing.save();
      summary.updated++;
      summary.items.push({ name: item.name, status: "updated" });
    } else {
      await SourceRegistry.create({
        name: item.name,
        sourceType: "api_connector",
        connectorType: item.connectorType,
        companyId: item.companyId,
        baseUrl: deriveBaseUrl(item.connectorType),
        crawlFrequency: item.crawlFrequency ?? 360,
        extractionStrategy: "manual_input",
        trustScore: 0.5,
        isEnabled: true,
      });
      summary.created++;
      summary.items.push({ name: item.name, status: "created" });
    }
  }

  return summary;
}

/**
 * The baseUrl stored on SourceRegistry rows is informational only — the
 * connector owns the real endpoint. Recording the API root helps humans
 * reading the registry understand what a row refers to.
 */
function deriveBaseUrl(type: SourceConnectorType): string {
  switch (type) {
    case "greenhouse":
      return "https://boards-api.greenhouse.io";
    case "lever":
      return "https://api.lever.co";
    case "ashby":
      return "https://api.ashbyhq.com";
    case "remoteok":
      return "https://remoteok.com";
  }
}
