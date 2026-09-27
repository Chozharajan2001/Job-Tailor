import { describe, it, expect } from "vitest";
import { detectPlatform, PLATFORMS } from "../src/platform-registry.js";

describe("platform-registry", () => {
  it("recognizes greenhouse job URLs (both board hosts)", () => {
    expect(
      detectPlatform("https://boards.greenhouse.io/acme/jobs/12345")?.id,
    ).toBe("greenhouse");
    expect(
      detectPlatform("https://job-boards.greenhouse.io/acme/jobs/123")?.id,
    ).toBe("greenhouse");
  });

  it("recognizes lever job URLs", () => {
    expect(detectPlatform("https://jobs.lever.co/acme/abc-1234-5678")?.id).toBe(
      "lever",
    );
  });

  it("recognizes ashby job URLs", () => {
    expect(
      detectPlatform("https://jobs.ashbyhq.com/acme/8f0a1b2c-3d4e-5f6a")?.id,
    ).toBe("ashby");
  });

  it("recognizes workday URLs across tenant hosts and data centers", () => {
    expect(
      detectPlatform(
        "https://acme.wd1.myworkdayjobs.com/en-US/External/job/xyz_123",
      )?.id,
    ).toBe("workday");
    expect(
      detectPlatform("https://acme-gmbh.wd10.myworkdayjobs.com/Careers/job/a")
        ?.id,
    ).toBe("workday");
  });

  it("returns null for unknown URLs and lookalike domains", () => {
    expect(detectPlatform("https://example.com/jobs/1")).toBeNull();
    // phishing-style suffix tricks must not match
    expect(detectPlatform("https://jobs.lever.co.evil.com/x")).toBeNull();
    expect(detectPlatform("https://notboards.greenhouse.io/x")).toBeNull();
  });

  it("every platform config is fully wired (detector + extractor)", () => {
    for (const p of PLATFORMS) {
      expect(p.detector, p.id).toBeTruthy();
      expect(p.extractor, p.id).toBeTruthy();
      expect(p.detector.id).toBe(p.id);
      expect(p.extractor.id).toBe(p.id);
    }
  });
});
