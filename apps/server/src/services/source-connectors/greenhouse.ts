import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";
import { runWithConcurrency } from "../source-poller.util.js";
import { connectorFetch } from "../../utils/connector-fetch.js";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

/** Per-board concurrency for detail enrichment — boards list 10–30 jobs
 *  and the poller already runs 5 sources in parallel. */
const DETAIL_CONCURRENCY = 4;

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
    const res = await connectorFetch(
      `${BASE}/${encodeURIComponent(token)}/jobs`,
      {
        headers: { "User-Agent": userAgent() },
      },
    );
    if (!res.ok) {
      throw new Error(`Greenhouse list ${token}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { jobs?: GreenhouseJobSummary[] };

    // H3 fix (2026-09-27): the list endpoint omits `content`, so raw list
    // summaries produced empty descriptions that failed CanonicalJob's
    // required validator — every Greenhouse job was silently dropped while
    // the poll reported success. Enrich each summary via the detail endpoint;
    // jobs whose detail cannot be fetched are skipped (an ingestable job
    // must have content) and retried on the next poll.
    const detailed = await runWithConcurrency(
      body.jobs ?? [],
      DETAIL_CONCURRENCY,
      async (j): Promise<RawJob | null> => {
        try {
          const detailRes = await connectorFetch(
            `${BASE}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(String(j.id))}`,
            { headers: { "User-Agent": userAgent() } },
          );
          if (!detailRes.ok) return null;
          const detail = (await detailRes.json()) as GreenhouseJobDetail;
          return toRawJob({ ...j, ...detail }, token);
        } catch {
          return null;
        }
      },
    );
    return detailed.filter((r): r is RawJob => r !== null);
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
  const res = await connectorFetch(
    `${BASE}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`,
    { headers: { "User-Agent": userAgent() } },
  );
  if (!res.ok) {
    throw new Error(`Greenhouse detail ${token}/${id}: HTTP ${res.status}`);
  }
  const body = (await res.json()) as GreenhouseJobDetail;
  return toRawJob(body, token);
}
