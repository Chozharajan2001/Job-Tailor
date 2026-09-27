import type { Extractor, PageContext, ApplicationDraft } from "../types.js";
import { humanizeSlug } from "../utils/text.js";

/**
 * Greenhouse job pages: https://(job-)?boards.greenhouse.io/<company>/jobs/<id>
 * Title is most reliable from <meta property="og:title"> ("Role @ Acme").
 * Body lives in #app. When og:title carries no "@", the company falls back
 * to the board's path slug, humanized.
 */
export const greenhouseExtractor: Extractor = {
  id: "greenhouse",
  extract(ctx: PageContext): ApplicationDraft {
    const url = new URL(ctx.url);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const companySlug = pathSegments[0] ?? "unknown";

    const og =
      ctx.document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content") ||
      ctx.document.title ||
      "";

    let jobTitle = og.trim();
    let companyName = humanizeSlug(companySlug);
    if (og.includes("@")) {
      const [role, org] = og.split("@");
      jobTitle = role.trim();
      companyName = org.trim() || companyName;
    } else if (jobTitle) {
      jobTitle = jobTitle.split(/[|·]/)[0].trim();
    } else {
      jobTitle =
        ctx.document.querySelector("h1")?.textContent?.trim() ??
        "Untitled role";
    }

    const body =
      ctx.document.querySelector("#app")?.textContent ??
      ctx.document.body?.innerText ??
      "";

    return {
      platform: "greenhouse",
      sourceUrl: ctx.url,
      companyName,
      jobTitle: jobTitle || "Untitled role",
      jdRawText: body.slice(0, 20000),
      detectedAt: new Date().toISOString(),
    };
  },
};
