import type { SourceConnectorType } from "../../models/SourceRegistry.model.js";

/**
 * Platform-agnostic job record produced by a SourceConnector after fetching
 * from a third-party API. The poller converts this into a CanonicalJobInput
 * via the connector's `toCanonicalJob` before handing it to IngestionService.
 */
export interface RawJob {
  externalId: string; // platform-native job id
  url: string; // absolute URL to the job
  title: string;
  companyName: string;
  locationText?: string;
  descriptionHtml?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  department?: string;
  team?: string;
  employmentType?: string;
  salaryText?: string;
}

/**
 * The subset of CanonicalJob fields that a connector can populate directly
 * from a public career-page API, without invoking the LLM parser.
 */
export interface CanonicalJobInput {
  title: string;
  companyName: string;
  location?: string;
  jdRawText: string;
  sourceUrl: string;
  externalId: string;
  publishedAt?: Date;
  updatedAt?: Date;
  employmentType?: string;
}

/**
 * Contract every platform connector implements.
 *
 * - `fetchJobs(token)` returns the platform's currently-listed jobs for a
 *   single company. RemoteOK ignores `token` (it's a firehose feed).
 * - `toCanonicalJob(raw, companyHint?)` normalizes a RawJob into the shape
 *   our ingestion pipeline expects. HTML bodies are stripped to plain text
 *   here; the LLM parse step is deferred to view-time.
 */
export interface SourceConnector {
  type: SourceConnectorType;
  fetchJobs(token: string): Promise<RawJob[]>;
  toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput;
}
