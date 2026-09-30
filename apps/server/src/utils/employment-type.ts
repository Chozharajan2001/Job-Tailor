import type { EmploymentType } from "@jobtailor/shared-types";

/**
 * Canonical form -> our enum, after lowercasing and dropping separators.
 * Keys are what the live ATS payloads actually send with separators removed:
 * Ashby "FullTime"/"Temporary"/"Intern"/"Contract", Lever "Full-time",
 * schema.org "FULL_TIME". Anything else (RemoteOK sends role tags) is not an
 * employment type, so it stays unset rather than being guessed.
 */
const CANONICAL: Record<string, EmploymentType> = {
  fulltime: "full-time",
  parttime: "part-time",
  contract: "contract",
  temporary: "contract",
  intern: "internship",
  internship: "internship",
};

export function normalizeEmploymentType(
  raw?: string,
): EmploymentType | undefined {
  if (!raw) return undefined;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return CANONICAL[key];
}
