import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJobSummary {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  departments?: { name?: string }[];
  offices?: { name?: string }[];
}

interface GreenhouseJobDetail extends GreenhouseJobSummary {
  content?: string;
}

function userAgent(): string {
  return process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0";
}

function toRawJob(j: GreenhouseJobDetail, token: string): RawJob {
  return {
    externalId: String(j.id),
    url: j.absolute_url,
    title: j.title,
    companyName: token,
    locationText: j.location?.name,
    descriptionHtml: j.content,
    updatedAt: j.updated_at ? new Date(j.updated_at) : undefined,
    publishedAt: j.first_published ? new Date(j.first_published) : undefined,
    department: j.departments?.[0]?.name,
  };
}

export const greenhouseConnector: SourceConnector = {
  type: "greenhouse",

  async fetchJobs(token: string): Promise<RawJob[]> {
    const res = await fetch(`${BASE}/${encodeURIComponent(token)}/jobs`, {
      headers: { "User-Agent": userAgent() },
    });
    if (!res.ok) {
      throw new Error(`Greenhouse list ${token}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { jobs?: GreenhouseJobSummary[] };
    return (body.jobs ?? []).map((j) => toRawJob(j, token));
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

/**
 * Fetch a single job with its HTML content. The list endpoint omits
 * `content`; callers use this when they need the description body (for
 * on-demand JD parsing at view time).
 */
export async function fetchJobDetail(
  token: string,
  id: string,
): Promise<RawJob> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`,
    { headers: { "User-Agent": userAgent() } },
  );
  if (!res.ok) {
    throw new Error(`Greenhouse detail ${token}/${id}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as GreenhouseJobDetail;
  return toRawJob(body, token);
}
