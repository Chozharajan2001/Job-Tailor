/**
 * In-process LRU+TTL cache for ATS scores.
 *
 * Key: sha256 of the deterministic (key-sorted) serialization of
 * { resumeContent, parsedJD, engineVersion } — so a new engine version can
 * never serve an old score. Degraded results (semantic phase failed) are
 * never cached: a retry after provider recovery must get a full score.
 *
 * Single-instance deployment (design doc §13) — deliberately no Redis or
 * persistence; a restart simply starts cold.
 */
import { createHash } from "node:crypto";
import type { IATSScore } from "../models/Resume.model.js";

const MAX_ENTRIES = 200;
const TTL_MS = 60 * 60 * 1000;

export function deterministicStringify(value: unknown): string {
  let v = value;
  // Mongoose documents/arrays (and Dates) carry circular internals; their
  // toJSON() yields the plain data shape JSON.stringify would also see.
  if (v !== null && typeof v === "object") {
    const maybe = v as { toJSON?: () => unknown };
    if (typeof maybe.toJSON === "function") v = maybe.toJSON();
  }
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(deterministicStringify).join(",")}]`;
  const record = v as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${deterministicStringify(record[k])}`)
    .join(",")}}`;
}

export function scoreKey(
  resumeContent: unknown,
  jd: unknown,
  engineVersion: number,
): string {
  return createHash("sha256")
    .update(deterministicStringify({ resumeContent, jd, engineVersion }))
    .digest("hex");
}

interface CacheEntry {
  score: IATSScore;
  expiresAt: number;
}

class ScoreCache {
  private map = new Map<string, CacheEntry>();

  get(key: string): IATSScore | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch: re-insert to move to the newest position
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.score;
  }

  set(key: string, score: IATSScore): void {
    if (score.semanticScoreDegraded === true) return; // never cache degraded
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { score, expiresAt: Date.now() + TTL_MS });
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const scoreCache = new ScoreCache();
