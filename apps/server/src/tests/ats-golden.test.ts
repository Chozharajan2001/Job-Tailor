import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IParsedJD } from "../models/Job.model.js";

// Mock ONLY at the provider boundary. The semantic phase always FAILS here so
// the golden scores exercise the deterministic phases + degraded renormalization
// (0.55/0.25/0.20) — fully reproducible without any AI provider.
vi.mock("../services/ai-provider/provider-manager.js", () => ({
  aiProviderManager: {
    generateStructuredOutput: vi
      .fn()
      .mockRejectedValue(new Error("golden: provider off")),
  },
}));

import {
  scoreATS,
  type ResumeContent,
} from "../services/ats-scoring.service.js";

interface GoldenCase {
  caseId: string;
  title: string;
  resume: ResumeContent;
  jd: IParsedJD;
  v1: {
    keywordMatchScore: number;
    sectionCompletenessScore: number;
    formatScore: number;
    degradedOverallScore: number;
  };
  v2?: { keywordMatchScore: number; degradedOverallScore: number };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(
  readFileSync(path.join(here, "fixtures", "ats-golden-cases.json"), "utf-8"),
) as GoldenCase[];

// Engine v2 (2026-09): synonym-aware graded-credit keyword phase. v1 values
// stay in the fixture as the recorded delta history (B: 50→95, C: 0→100).
const ENGINE_UNDER_TEST = "v2" as "v1" | "v2";

describe("ATS golden-score regression (deterministic phases, provider mocked off)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(cases.map((c) => [c.caseId, c] as const))(
    "%s pins keyword/completeness/format/degraded-overall",
    async (_id, c) => {
      const result = await scoreATS(c.resume, c.jd);
      expect(result.semanticScoreDegraded).toBe(true);

      const expected =
        ENGINE_UNDER_TEST === "v1"
          ? {
              keywordMatchScore: c.v1.keywordMatchScore,
              degradedOverallScore: c.v1.degradedOverallScore,
            }
          : {
              keywordMatchScore: c.v2!.keywordMatchScore,
              degradedOverallScore: c.v2!.degradedOverallScore,
            };

      expect(result.keywordMatchScore).toBe(expected.keywordMatchScore);
      // Completeness and format phases are frozen across engine versions.
      expect(result.sectionCompletenessScore).toBe(
        c.v1.sectionCompletenessScore,
      );
      expect(result.formatScore).toBe(c.v1.formatScore);
      expect(result.overallScore).toBe(expected.degradedOverallScore);
    },
  );
});
