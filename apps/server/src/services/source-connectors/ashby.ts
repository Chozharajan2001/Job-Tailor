import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  department?: string;
  team?: string;
  jobUrl: string;
  descriptionHtml?: string;
  publishedAt?: string;
  isListed?: boolean;
  employmentType?: string;
}

function userAgent(): string {
  return process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0";
}

export const ashbyConnector: SourceConnector = {
  type: "ashby",

  async fetchJobs(token: string): Promise<RawJob[]> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(token)}?includeCompensation=true`,
      { headers: { "User-Agent": userAgent() } },
    );
    if (!res.ok) {
      throw new Error(`Ashby ${token}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { jobs?: AshbyJob[] };
    return (body.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        externalId: j.id,
        url: j.jobUrl,
        title: j.title,
        companyName: token,
        locationText: j.location,
        department: j.department,
        team: j.team,
        employmentType: j.employmentType,
        descriptionHtml: j.descriptionHtml,
        publishedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
      }));
  },

  toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput {
    return {
      title: raw.title,
      companyName: companyHint ?? raw.companyName,
      location: raw.locationText,
      jdRawText: htmlToText(raw.descriptionHtml ?? ""),
      sourceUrl: raw.url,
      externalId: raw.externalId,
      publishedAt: raw.publishedAt,
      updatedAt: raw.updatedAt,
      employmentType: raw.employmentType,
    };
  },
};
