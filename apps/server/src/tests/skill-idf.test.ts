import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import {
  computeSkillIdfMap,
  clearIdfCache,
} from "../services/skill-idf.service.js";

process.env.NODE_ENV = "test";

async function seedJob(title: string, description: string) {
  await CanonicalJob.create({
    sourceType: "manual",
    sourceName: "test",
    jobTitle: title,
    companyName: "Corp",
    description,
    dedupeKey: `corp_${title.toLowerCase()}_test`,
  });
}

describe("computeSkillIdfMap", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    clearIdfCache();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("returns an empty map when the corpus is empty (graceful degeneration)", async () => {
    const map = await computeSkillIdfMap(["React", "Kubernetes"]);
    expect(map.size).toBe(0);
  });

  it("weights rare skills higher than common ones", async () => {
    // df: communication=3, React=2, Kubernetes=1 → rarity order K > R > C
    await seedJob(
      "a",
      "Strong communication skills required. React and Kubernetes.",
    );
    await seedJob("b", "Great communication and React knowledge.");
    await seedJob("c", "Excellent communication, frontend expertise.");
    const map = await computeSkillIdfMap([
      "React",
      "Kubernetes",
      "communication",
    ]);
    expect(map.size).toBe(3);
    expect(map.get("Kubernetes")!).toBeGreaterThan(map.get("React")!);
    expect(map.get("React")!).toBeGreaterThan(map.get("communication")!);
    // normalized: the rarest skill maps to 1
    expect(map.get("Kubernetes")).toBe(1);
  });

  it("uses synonym expansion for df counting (SRE doc counts for Site Reliability)", async () => {
    await seedJob("sre1", "We need an SRE for on-call rotation.");
    await seedJob("other", "Frontend React role.");
    const map = await computeSkillIdfMap(["Site Reliability"]);
    // df=1 of N=2 → idf = ln(1 + 2/2) = ln 2; single skill → normalized to 1
    expect(map.get("Site Reliability")).toBe(1);
  });

  it("serves repeated calls from the in-process cache", async () => {
    await seedJob("x", "React role.");
    const first = await computeSkillIdfMap(["React"]);
    await CanonicalJob.deleteMany({}); // cache must mask this change
    const second = await computeSkillIdfMap(["React"]);
    expect(second.get("React")).toBe(first.get("React"));
    clearIdfCache();
    const third = await computeSkillIdfMap(["React"]);
    expect(third.size).toBe(0); // cache cleared → corpus genuinely empty now
  });
});
