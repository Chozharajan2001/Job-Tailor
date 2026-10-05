import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";
import { connectorFetch } from "../../utils/connector-fetch.js";

const BASE = "https://api.lever.co/v0/postings";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: {
    location?: string;
    team?: string;
    commitment?: string;
  };
  createdAt?: number;
  descriptionPlain?: string;
  descriptionList?: { content: string }[];
}

function userAgent(): string {
  return process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0";
}

export const leverConnector: SourceConnector = {
  type: "lever",

  async fetchJobs(token: string): Promise<RawJob[]> {
    const res = await connectorFetch(
      `${BASE}/${encodeURIComponent(token)}?mode=json`,
      {
        headers: { "User-Agent": userAgent() },
      },
    );
    if (!res.ok) {
      throw new Error(`Lever ${token}: HTTP ${res.status}`);
    }
    const list = (await res.json()) as LeverPosting[];
    return list.map((p) => ({
      externalId: p.id,
      url: p.hostedUrl,
      title: p.text,
      companyName: token,
      locationText: p.categories?.location,
      team: p.categories?.team,
      employmentType: p.categories?.commitment,
      publishedAt: p.createdAt ? new Date(p.createdAt) : undefined,
      descriptionHtml:
        p.descriptionPlain ??
        p.descriptionList?.map((d) => d.content).join("\n\n"),
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
