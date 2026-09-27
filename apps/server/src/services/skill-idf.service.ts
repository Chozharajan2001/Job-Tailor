/**
 * Inverse-document-frequency weighting for ATS keyword scoring, computed
 * from the user-visible CanonicalJob corpus (populated by live job discovery).
 * Distinctive skills ("Kubernetes") outweigh ubiquitous ones ("communication").
 *
 * Design constraints:
 * - Bounded corpus: newest 500 descriptions, fetched at most once per hour.
 * - Graceful degeneration: empty corpus or any DB error → empty map, and the
 *   keyword scorer falls back to plain required/preferred weights.
 */
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { getSynonymRegexString } from "../utils/skill-matcher.js";

const CORPUS_CAP = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

let corpusCache: { at: number; docs: string[] } | null = null;

export function clearIdfCache(): void {
  corpusCache = null;
}

async function loadCorpus(): Promise<string[]> {
  const now = Date.now();
  if (corpusCache && now - corpusCache.at < CACHE_TTL_MS)
    return corpusCache.docs;
  const docs = await CanonicalJob.find()
    .sort({ createdAt: -1 })
    .limit(CORPUS_CAP)
    .select("description")
    .lean();
  const texts = docs
    .map((d) =>
      String((d as { description?: unknown }).description ?? "").toLowerCase(),
    )
    .filter((t) => t.length > 0);
  corpusCache = { at: now, docs: texts };
  return texts;
}

export async function computeSkillIdfMap(
  skills: string[],
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(skills.filter((s) => s.trim().length > 0)));
  if (unique.length === 0) return new Map();
  try {
    const corpus = await loadCorpus();
    if (corpus.length === 0) return new Map();

    const n = corpus.length;
    const idf = new Map<string, number>();
    let maxIdf = 0;
    for (const skill of unique) {
      const re = new RegExp(getSynonymRegexString(skill), "i");
      const df = corpus.reduce(
        (count, doc) => (re.test(doc) ? count + 1 : count),
        0,
      );
      const value = Math.log(1 + n / (1 + df));
      idf.set(skill, value);
      if (value > maxIdf) maxIdf = value;
    }
    if (maxIdf <= 0) return new Map();

    const normalized = new Map<string, number>();
    for (const [skill, value] of idf) {
      normalized.set(skill, Math.round((value / maxIdf) * 10000) / 10000);
    }
    return normalized;
  } catch (err) {
    console.warn(
      "[skill-idf] corpus unavailable, scoring without IDF weighting:",
      err,
    );
    return new Map();
  }
}
