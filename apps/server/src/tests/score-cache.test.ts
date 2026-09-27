import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  scoreCache,
  scoreKey,
  deterministicStringify,
} from "../services/score-cache.js";
import type { IATSScore } from "../models/Resume.model.js";

function fakeScore(overrides: Partial<IATSScore> = {}): IATSScore {
  return {
    overallScore: 70,
    keywordMatchScore: 70,
    semanticMatchScore: 70,
    sectionCompletenessScore: 70,
    formatScore: 70,
    breakdown: {
      matchedSkills: [],
      missingSkills: [],
      weakSkills: [],
      actionItems: [],
    },
    ...overrides,
  };
}

describe("score-cache", () => {
  beforeEach(() => {
    scoreCache.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deterministicStringify is key-order independent", () => {
    expect(deterministicStringify({ a: 1, b: { x: 2, y: 3 } })).toBe(
      deterministicStringify({ b: { y: 3, x: 2 }, a: 1 }),
    );
  });

  it("uses toJSON when present (mongoose-document safe)", () => {
    const docLike = { toJSON: () => ({ b: 2, a: 1 }) };
    expect(deterministicStringify(docLike)).toBe(
      deterministicStringify({ a: 1, b: 2 }),
    );
  });

  it("scoreKey changes with engine version and content", () => {
    const k1 = scoreKey({ s: "a" }, { j: 1 }, 2);
    expect(scoreKey({ s: "a" }, { j: 1 }, 2)).toBe(k1);
    expect(scoreKey({ s: "b" }, { j: 1 }, 2)).not.toBe(k1);
    expect(scoreKey({ s: "a" }, { j: 1 }, 1)).not.toBe(k1);
  });

  it("round-trips a score and reports size", () => {
    const key = scoreKey({ r: 1 }, { j: 1 }, 2);
    expect(scoreCache.get(key)).toBeUndefined();
    scoreCache.set(key, fakeScore({ overallScore: 82 }));
    expect(scoreCache.get(key)?.overallScore).toBe(82);
    expect(scoreCache.size).toBe(1);
  });

  it("refuses to store degraded results", () => {
    const key = scoreKey({ r: 2 }, { j: 2 }, 2);
    scoreCache.set(key, fakeScore({ semanticScoreDegraded: true }));
    expect(scoreCache.get(key)).toBeUndefined();
    expect(scoreCache.size).toBe(0);
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    const key = scoreKey({ r: 3 }, { j: 3 }, 2);
    scoreCache.set(key, fakeScore());
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(scoreCache.get(key)).toBeUndefined();
  });

  it("evicts the least-recently-used entry beyond capacity", () => {
    for (let i = 0; i < 201; i++) {
      scoreCache.set(scoreKey({ i }, {}, 2), fakeScore({ overallScore: i }));
    }
    expect(scoreCache.size).toBe(200);
    expect(scoreCache.get(scoreKey({ i: 0 }, {}, 2))).toBeUndefined(); // LRU evicted
    expect(scoreCache.get(scoreKey({ i: 200 }, {}, 2))?.overallScore).toBe(200);
  });
});
