import type { Extractor, PageContext, ApplicationDraft } from "../types.js";
import { htmlToText } from "../utils/text.js";

/**
 * Workday (wdN.myworkdayjobs.com) job detail pages:
 *  - job title: <p class="job-title"> (sometimes an <h1>)
 *  - company:   tenant subdomain prefix ("acme.wd1…" → "Acme"), or the
 *               "hiring-organization" header text when present
 *  - body:      <section aria-label="Job Description"> is the stable
 *               ARIA landmark Workday ships by default
 * On the post-submit confirmation page the JD section may be gone; we then
 * fall back to whatever is on the page plus the job title from history.
 */
export const workdayExtractor: Extractor = {
  id: "workday",
  extract(ctx: PageContext): ApplicationDraft {
    const url = new URL(ctx.url);
    const tenant = url.hostname.split(".")[0].replace(/-/g, " ");
    const companyName =
      ctx.document
        .querySelector('[data-automation-id="jobPostingHeader"] h1')
        ?.textContent?.trim() || titleCase(tenant);

    const jobTitle =
      ctx.document.querySelector(".job-title")?.textContent?.trim() ||
      ctx.document.querySelector("h1")?.textContent?.trim() ||
      ctx.document.title.split("|")[0].trim() ||
      "Untitled role";

    const jdSection =
      ctx.document.querySelector('section[aria-label="Job Description"]') ??
      ctx.document.querySelector('[data-automation-id="jobPostingInfo"]');
    const body = jdSection?.innerHTML ?? ctx.document.body?.innerText ?? "";

    return {
      platform: "workday",
      sourceUrl: ctx.url,
      companyName,
      jobTitle,
      jdRawText: htmlToText(body).slice(0, 20000),
      detectedAt: new Date().toISOString(),
    };
  },
};

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
