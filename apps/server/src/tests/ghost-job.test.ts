import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { scoreGhostSignals } from "../services/ghost-job.service.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "fixtures/ghost-golden-cases.json"), "utf8"),
) as {
  cases: Array<{
    name: string;
    job: Record<string, unknown>;
    sameRoleCount: number;
    now: string;
    expectedRisk: number;
    expectedReasons: string[];
  }>;
};

describe("scoreGhostSignals golden cases", () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      const verdict = scoreGhostSignals(
        {
          ...c.job,
          firstSeenAt: new Date(c.job.firstSeenAt as string),
          lastSeenAt: new Date(c.job.lastSeenAt as string),
          postedDate: c.job.postedDate
            ? new Date(c.job.postedDate as string)
            : undefined,
        } as never,
        { sameRoleCount: c.sameRoleCount, now: new Date(c.now) },
      );
      expect(verdict.risk).toBeCloseTo(c.expectedRisk, 4);
      expect(verdict.reasons).toEqual(c.expectedReasons);
    });
  }
});
