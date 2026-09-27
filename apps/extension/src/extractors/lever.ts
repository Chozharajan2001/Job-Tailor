import type { Extractor, PageContext, ApplicationDraft } from "../types.js";
import { htmlToText, humanizeSlug } from "../utils/text.js";

/**
 * Lever posting pages: https://jobs.lever.co/<company>/<postingUuid>
 * Title: <div class="posting-name"> or first <h3>. Body:
 * <div class="contents"> is the stable JD container.
 */
export const leverExtractor: Extractor = {
  id: "lever",
  extract(ctx: PageContext): ApplicationDraft {
    const url = new URL(ctx.url);
    const companySlug = url.pathname.split("/").filter(Boolean)[0] ?? "unknown";

    const title =
      ctx.document.querySelector(".posting-name")?.textContent?.trim() ||
      ctx.document.querySelector("h3")?.textContent?.trim() ||
      ctx.document.title.trim() ||
      "Untitled role";

    const body = ctx.document.querySelector(".contents")?.innerHTML ?? "";

    return {
      platform: "lever",
      sourceUrl: ctx.url,
      companyName: humanizeSlug(companySlug),
      jobTitle: title,
      jdRawText: htmlToText(body).slice(0, 20000),
      detectedAt: new Date().toISOString(),
    };
  },
};
