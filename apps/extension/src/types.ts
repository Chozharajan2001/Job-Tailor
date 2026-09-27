/**
 * Shared types for the auto-track extension.
 *
 * ApplicationDraft mirrors apps/server/src/services/application-draft.types.ts
 * — the server's Zod schema is the source of truth; if they drift, the
 * server rejects the request with INVALID_DRAFT and the popup surfaces it.
 */

export type Platform = "greenhouse" | "lever" | "ashby" | "workday" | "unknown";

export interface ApplicationDraft {
  platform: Platform;
  sourceUrl: string;
  companyName: string;
  jobTitle: string;
  jdRawText: string;
  detectedAt: string; // ISO
}

/** What detectors and extractors get to inspect: the live page. */
export interface PageContext {
  url: string;
  document: Document;
}

/** Answers: "has the user finished submitting an application on this page?" */
export interface Detector {
  id: Platform;
  isApplicationSubmitted(ctx: PageContext): boolean;
}

/** Turns a job/application page into the payload the server expects. */
export interface Extractor {
  id: Platform;
  extract(ctx: PageContext): ApplicationDraft;
}

export interface PlatformConfig {
  id: Exclude<Platform, "unknown">;
  urlMatch: RegExp;
  detector: Detector;
  extractor: Extractor;
}
