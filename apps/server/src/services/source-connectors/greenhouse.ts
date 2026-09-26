/**
 * Replace this stub in Task 3 with the real Greenhouse boards-api connector.
 */
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";

export const greenhouseConnector: SourceConnector = {
  type: "greenhouse",
  async fetchJobs(_token: string): Promise<RawJob[]> {
    return [];
  },
  toCanonicalJob(_raw: RawJob, _companyHint?: string): CanonicalJobInput {
    throw new Error("greenhouse.toCanonicalJob not implemented yet");
  },
};
