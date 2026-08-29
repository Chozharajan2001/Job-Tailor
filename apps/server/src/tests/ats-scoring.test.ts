import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IParsedJD } from "../models/Job.model.js";

// Mock ONLY at the AI provider boundary — the scoring algorithms themselves run for real.
vi.mock("../services/ai-provider/provider-manager.js", () => ({
  aiProviderManager: {
    generateStructuredOutput: vi.fn(),
  },
}));

import { aiProviderManager } from "../services/ai-provider/provider-manager.js";
import { scoreATS } from "../services/ats-scoring.service.js";

const mockedGenerate = vi.mocked(aiProviderManager.generateStructuredOutput);

const fixtureJD: IParsedJD = {
  summary: "Build our web platform",
  seniorityLevel: "mid",
  focusWeights: { frontend: 50, backend: 40, devops: 10, ai: 0, mobile: 0 },
  requiredSkills: ["React", "Node.js"],
  preferredSkills: ["TypeScript"],
  responsibilities: ["Ship features"],
  qualifications: ["B.S. CS"],
  niceToHaves: ["Docker"],
  tone: "technical",
};

const fixtureResume = {
  summary: "Frontend engineer focused on React and performance.",
  skills: [
    {
      name: "React",
      category: "frontend",
      yearsOfExperience: 3,
      proficiency: "advanced",
    },
    {
      name: "Node.js",
      category: "backend",
      yearsOfExperience: 2,
      proficiency: "intermediate",
    },
  ],
  experience: [
    {
      company: "Acme",
      bullets: [
        { text: "Rebuilt the dashboard in React, cutting load time 40%." },
        { text: "Built Node.js APIs serving 1M requests/day." },
      ],
    },
  ],
  projects: [
    { name: "Portfolio", techStack: ["React"], highlights: ["10k users"] },
  ],
};

describe("ATS scoring (real algorithms, mocked LLM)", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  it("produces a weighted score including the LLM semantic phase", async () => {
    mockedGenerate.mockResolvedValue({ score: 80, reasoning: "strong match" });

    const result = await scoreATS(fixtureResume as never, fixtureJD);

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.semanticMatchScore).toBe(80);
    expect(result.keywordMatchScore).toBeGreaterThan(0);
    expect(result.sectionCompletenessScore).toBeGreaterThan(0);
    expect(result.formatScore).toBeGreaterThan(0);
    expect(result.semanticScoreDegraded).toBeFalsy();
  });

  it("keyword scoring weights required skills double and includes preferred skills", async () => {
    mockedGenerate.mockResolvedValue({ score: 50 });

    const result = await scoreATS(fixtureResume as never, fixtureJD);
    // Both required skills (React, Node.js → weight 2 each) match,
    // preferred TypeScript (weight 1) does not → (2+2)/(2+2+1) = 80%
    expect(result.keywordMatchScore).toBe(80);
  });

  it("flags missing skills in the breakdown", async () => {
    mockedGenerate.mockResolvedValue({ score: 50 });

    const jdMissing: IParsedJD = {
      ...fixtureJD,
      requiredSkills: ["React", "Kubernetes"], // Kubernetes not in resume
    };
    const result = await scoreATS(fixtureResume as never, jdMissing);

    const missing = result.breakdown.missingSkills.map((m) => m.skill);
    expect(missing).toContain("Kubernetes");
    expect(missing).not.toContain("React");
  });

  it("never fabricates a semantic score — degrades deterministically when the LLM fails", async () => {
    mockedGenerate.mockRejectedValue(new Error("provider down"));

    const result = await scoreATS(fixtureResume as never, fixtureJD);

    expect(result.semanticScoreDegraded).toBe(true);
    expect(result.semanticMatchScore).toBe(0);
    // Overall still computed from the deterministic phases
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.breakdown.actionItems[0]).toMatch(/unavailable/i);
  });

  it("clamps an out-of-range LLM score to 0-100", async () => {
    mockedGenerate.mockResolvedValue({ score: 999 });
    const result = await scoreATS(fixtureResume as never, fixtureJD);
    expect(result.semanticMatchScore).toBe(100);
  });
});
