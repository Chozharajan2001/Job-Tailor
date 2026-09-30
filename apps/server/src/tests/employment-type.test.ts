import { describe, it, expect } from "vitest";
import { normalizeEmploymentType } from "../utils/employment-type.js";

describe("normalizeEmploymentType", () => {
  it("maps the values live ATS payloads actually send", () => {
    // Ashby boards sampled 2026-09-30 (ramp, linear, notion, clickhouse)
    expect(normalizeEmploymentType("FullTime")).toBe("full-time");
    expect(normalizeEmploymentType("PartTime")).toBe("part-time");
    expect(normalizeEmploymentType("Contract")).toBe("contract");
    expect(normalizeEmploymentType("Temporary")).toBe("contract");
    expect(normalizeEmploymentType("Intern")).toBe("internship");
    // Lever commitment + schema.org JobPosting variants
    expect(normalizeEmploymentType("Full-time")).toBe("full-time");
    expect(normalizeEmploymentType("Full Time")).toBe("full-time");
    expect(normalizeEmploymentType("FULL_TIME")).toBe("full-time");
    expect(normalizeEmploymentType("INTERNSHIP")).toBe("internship");
  });

  it("leaves values that are not employment types unset", () => {
    // RemoteOK tags carry role/category words, not employment types
    expect(normalizeEmploymentType("golang")).toBeUndefined();
    expect(normalizeEmploymentType("exec")).toBeUndefined();
    expect(normalizeEmploymentType("other")).toBeUndefined();
    expect(normalizeEmploymentType("")).toBeUndefined();
    expect(normalizeEmploymentType(undefined)).toBeUndefined();
  });
});
