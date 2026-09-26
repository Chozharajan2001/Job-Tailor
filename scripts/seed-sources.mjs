#!/usr/bin/env node
/**
 * Bootstrap the job-source registry from data/seed-companies.json, then
 * trigger the first poll. Requires the server to be running and the
 * SOURCE_POLL_ADMIN_KEY env var to match the server's.
 *
 * Usage:
 *   node scripts/seed-sources.mjs
 *   node scripts/seed-sources.mjs --file path/to/other.json
 *   API_BASE=https://api.jobtailor.app SOURCE_POLL_ADMIN_KEY=... node scripts/seed-sources.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE ?? "http://localhost:5000/api/v1";
const ADMIN_KEY = process.env.SOURCE_POLL_ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error("SOURCE_POLL_ADMIN_KEY env var is required");
  process.exit(1);
}

const flagIndex = process.argv.indexOf("--file");
const seedPath =
  flagIndex >= 0
    ? resolve(process.argv[flagIndex + 1])
    : resolve(__dirname, "../data/seed-companies.json");

const raw = JSON.parse(readFileSync(seedPath, "utf8"));
const items = raw.items ?? raw;

console.log(`Seeding ${items.length} sources from ${seedPath}`);

const seedRes = await fetch(`${API_BASE}/admin/seed-sources`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-admin-key": ADMIN_KEY,
  },
  body: JSON.stringify({ items }),
});
if (!seedRes.ok) {
  console.error(
    `seed failed: HTTP ${seedRes.status}`,
    await seedRes.text(),
  );
  process.exit(1);
}
const seedBody = await seedRes.json();
console.log("seed:", seedBody.data);

console.log("triggering first poll…");
const pollRes = await fetch(`${API_BASE}/admin/poll-due-sources`, {
  method: "POST",
  headers: { "x-admin-key": ADMIN_KEY },
});
if (!pollRes.ok) {
  console.error(
    `poll failed: HTTP ${pollRes.status}`,
    await pollRes.text(),
  );
  process.exit(1);
}
const pollBody = await pollRes.json();
console.log("poll:", pollBody.data);
