/**
 * Replace this stub in Task 5 with the real Ashby posting-api connector.
 */
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";

export const ashbyConnector: SourceConnector = {
  type: "ashby",
  async fetchJobs(_token: string): Promise<RawJob[]> {
    return [];
  },
  toCanonicalJob(_raw: RawJob, _companyHint?: string): CanonicalJobInput {
    throw new Error("ashby.toCanonicalJob not implemented yet");
  },
};
