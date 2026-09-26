/**
 * Replace this stub in Task 4 with the real Lever postings-api connector.
 */
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";

export const leverConnector: SourceConnector = {
  type: "lever",
  async fetchJobs(_token: string): Promise<RawJob[]> {
    return [];
  },
  toCanonicalJob(_raw: RawJob, _companyHint?: string): CanonicalJobInput {
    throw new Error("lever.toCanonicalJob not implemented yet");
  },
};
