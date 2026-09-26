/**
 * Replace this stub in Task 6 with the real RemoteOK public feed connector.
 */
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";

export const remoteokConnector: SourceConnector = {
  type: "remoteok",
  async fetchJobs(_token: string): Promise<RawJob[]> {
    return [];
  },
  toCanonicalJob(_raw: RawJob, _companyHint?: string): CanonicalJobInput {
    throw new Error("remoteok.toCanonicalJob not implemented yet");
  },
};
