import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";
import { normalizeEmploymentType } from "../../utils/employment-type.js";
import { connectorFetch } from "../../utils/connector-fetch.js";

const FEED_URL = "https://remoteok.com/api";

/**
 * RemoteOK has no employment-type field: `tags[0]` is a role/category tag
 * ("golang", "design", "exec" in the live feed). The type, when present at
 * all, is one of the later tags.
 */
function employmentTypeTag(tags?: string[]): string | undefined {
  return tags?.find((tag) => normalizeEmploymentType(tag) !== undefined);
}

interface RemoteOkJob {
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  published_at?: string;
  tags?: string[];
}

function userAgent(): string {
  return process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0";
}

export const remoteokConnector: SourceConnector = {
  type: "remoteok",

  /**
   * RemoteOK is a firehose — the `token` argument is ignored. Callers
   * register exactly one SourceRegistry row with `companyId: "_"`.
   */
  async fetchJobs(_token: string): Promise<RawJob[]> {
    const res = await connectorFetch(FEED_URL, {
      headers: { "User-Agent": userAgent() },
    });
    if (!res.ok) {
      throw new Error(`RemoteOK: HTTP ${res.status}`);
    }
    const list = (await res.json()) as RemoteOkJob[];
    // The feed occasionally returns header/meta rows without a position
    // or malformed entries — filter to records that have the minimum fields
    // needed to become a CanonicalJob.
    return list
      .filter((j) => Boolean(j.position && j.company && j.url))
      .map((j) => ({
        externalId: j.url as string,
        url: j.url as string,
        title: j.position as string,
        companyName: j.company as string,
        locationText: j.location,
        descriptionHtml: j.description,
        publishedAt: j.published_at ? new Date(j.published_at) : undefined,
        employmentType: employmentTypeTag(j.tags),
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
