import mongoose from "mongoose";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { SourceRegistry } from "../models/SourceRegistry.model.js";
import { pollDueSources } from "../services/source-poller.service.js";

/**
 * Local development helper: registers the companies from
 * data/seed-companies.json (which nothing else consumes) and polls every
 * due source through the real pipeline. Run from apps/server:
 *   MONGODB_URI=... npx tsx src/scripts/seed-and-poll.ts
 */
interface SeedCompany {
  name: string;
  connectorType: "greenhouse" | "lever" | "ashby" | "remoteok";
  companyId: string;
}

const BASE_URL: Record<SeedCompany["connectorType"], string> = {
  greenhouse: "https://boards-api.greenhouse.io",
  lever: "https://api.lever.co",
  ashby: "https://api.ashbyhq.com",
  remoteok: "https://remoteok.com",
};

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);

  const seedPath = fileURLToPath(
    new URL("../../../../data/seed-companies.json", import.meta.url),
  );
  const items = (JSON.parse(readFileSync(seedPath, "utf8")).items ??
    []) as SeedCompany[];

  for (const item of items) {
    await SourceRegistry.updateOne(
      { name: item.name },
      {
        $setOnInsert: {
          name: item.name,
          sourceType: "api_connector",
          connectorType: item.connectorType,
          companyId: item.companyId,
          baseUrl: BASE_URL[item.connectorType],
          crawlFrequency: 360,
          extractionStrategy: "manual_input",
          trustScore: 0.5,
        },
        $set: { lastPolledAt: new Date(0), isEnabled: true },
      },
      { upsert: true },
    );
  }
  console.log(`seeded ${items.length} sources from data/seed-companies.json`);

  const summary = await pollDueSources();
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
