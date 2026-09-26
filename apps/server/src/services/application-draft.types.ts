/**
 * Shape of an application the browser extension has detected and the user
 * has confirmed to add. Sent as the JSON body to POST /applications/from-extension
 * with `x-api-key` auth. Duplicated intentionally between server and
 * extension packages; the Zod schema in the controller is the source of truth.
 */
export interface ApplicationDraft {
  platform: "greenhouse" | "lever" | "ashby" | "workday" | "unknown";
  sourceUrl: string;
  companyName: string;
  jobTitle: string;
  jdRawText: string;
  detectedAt: string; // ISO
}
