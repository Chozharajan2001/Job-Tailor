import { describe, it, expect } from "vitest";
import { scoreKeywordsV2 } from "../services/keyword-scorer.js";
import type { ResumeContent } from "../services/ats-scoring.service.js";
import type { IParsedJD } from "../models/Job.model.js";

const baseResume: ResumeContent = {
  summary: "Built React.js dashboards and TS tooling.",
  skills: [
    {
      name: "React.js",
      category: "frontend",
      yearsOfExperience: 2,
      proficiency: "advanced",
    },
  ],
  experience: [
    {
      company: "Beta",
      bullets: [{ text: "Shipped React.js component library." }],
    },
  ],
  projects: [],
};

function jd(required: string[], preferred: string[] = []): IParsedJD {
  return {
    summary: "role",
    seniorityLevel: "mid",
    focusWeights: { frontend: 100, backend: 0, devops: 0, ai: 0, mobile: 0 },
    requiredSkills: required,
    preferredSkills: preferred,
    responsibilities: [],
    qualifications: [],
    niceToHaves: [],
    tone: "technical",
  };
}

describe("scoreKeywordsV2", () => {
  it("grades exact matches at 1.0 and keeps required 2x / preferred 1x weights", () => {
    const r = scoreKeywordsV2(baseResume, jd(["React"], ["GraphQL"]));
    // React: bounded-exact hits inside "React.js" ('.' is a non-word boundary) → 1.0.
    // Spread: summary + skills + experience = 3 sections → +0.1 capped at 1.0.
    // GraphQL: none → 0.  (2*1.0)/(2+1) = 66.67 → 67
    expect(r.score).toBe(67);
    expect(r.credits.find((c) => c.skill === "React")?.matchedBy).toBe("exact");
    expect(r.credits.find((c) => c.skill === "GraphQL")?.matchedBy).toBe(
      "none",
    );
  });

  it("grades synonym matches at 0.9 (TS counts for TypeScript)", () => {
    const r = scoreKeywordsV2(baseResume, jd(["TypeScript"]));
    expect(r.credits[0].matchedBy).toBe("synonym");
    expect(r.score).toBe(90); // 0.9 * 100, single skill, one section only
  });

  it("grades multi-word token-subset matches at 0.75", () => {
    const resume: ResumeContent = {
      ...baseResume,
      summary: "Systems design at large scale.",
      skills: [],
      experience: [
        {
          company: "X",
          bullets: [{ text: "Owned distributed infrastructure reliability." }],
        },
      ],
    };
    const r = scoreKeywordsV2(resume, jd(["Distributed Systems"]));
    expect(r.credits[0].matchedBy).toBe("token-subset");
    // Tokens appear in separate sections, never as the contiguous phrase, so
    // exact/synonym regexes miss and spread adds nothing: 0.75 → 75
    expect(r.score).toBe(75);
  });

  it("expands synonyms for multi-word groups (SRE ↔ Site Reliability)", () => {
    const resume: ResumeContent = {
      ...baseResume,
      summary: "SRE practices and on-call ownership.",
      skills: [
        {
          name: "SRE",
          category: "devops",
          yearsOfExperience: 4,
          proficiency: "advanced",
        },
      ],
    };
    const r = scoreKeywordsV2(resume, jd(["Site Reliability"]));
    expect(r.credits[0].matchedBy).toBe("synonym");
    // synonym 0.9 + spread (summary + skills sections) 0.1 → 1.0 → 100
    expect(r.score).toBe(100);
  });

  it("returns 0 (not NaN) when the JD lists no skills", () => {
    const r = scoreKeywordsV2(baseResume, jd([]));
    expect(r.score).toBe(0);
    expect(r.credits).toEqual([]);
  });

  it("applies IDF normalization when provided", () => {
    const idf = new Map<string, number>([
      ["React", 0.5],
      ["GraphQL", 1.0],
    ]);
    const r = scoreKeywordsV2(baseResume, jd(["React"], ["GraphQL"]), idf);
    // effective weights: React 2*0.5=1.0 (credit 1.0), GraphQL 1*1.0=1.0 (credit 0)
    // (1.0*1.0 + 1.0*0) / 2.0 = 50
    expect(r.score).toBe(50);
    expect(r.credits.find((c) => c.skill === "React")?.effectiveWeight).toBe(
      1.0,
    );
  });
});
