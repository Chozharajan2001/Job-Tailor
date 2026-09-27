import type { Extractor, PageContext, ApplicationDraft } from "../types.js";
import { htmlToText, humanizeSlug } from "../utils/text.js";

/**
 * Ashby job pages embed the full job record as a JSON assignment to
 * window.__ASBY__DATA in an inline <script>. We read the script's text —
 * never executing page JS (content scripts run in an isolated world, and
 * touching page state is exactly what a tool that posts to the user's
 * account should not do).
 *
 * Falls back to the visible DOM (h2 title, main body) when the blob is
 * absent or malformed.
 */
export const ashbyExtractor: Extractor = {
  id: "ashby",
  extract(ctx: PageContext): ApplicationDraft {
    const url = new URL(ctx.url);
    const orgSlug = url.pathname.split("/").filter(Boolean)[0] ?? "unknown";
    let companyName = humanizeSlug(orgSlug);
    let jobTitle = "";
    let body = "";

    const scripts = Array.from(ctx.document.querySelectorAll("script"));
    for (const s of scripts) {
      const text = s.textContent ?? "";
      const marker = "__ASBY__DATA";
      const idx = text.indexOf(marker);
      if (idx === -1) continue;
      const braceStart = text.indexOf("{", idx);
      if (braceStart === -1) continue;
      // JSON-encoded assignment; parse defensively, bail on any error.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any = null;
        // Find the end of the assigned object literal via balanced braces.
        let depth = 0;
        let end = -1;
        for (let i = braceStart; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        if (end === -1) continue;
        data = JSON.parse(text.slice(braceStart, end));
        const job = data?.job ?? data?.currentJob;
        if (job?.name) {
          jobTitle = String(job.name);
          if (job.organizationName) companyName = String(job.organizationName);
          if (job.descriptionHtml) {
            // Plain-text strip via regex helper — never innerHTML on
            // untrusted page markup (detached nodes can still fire
            // resource loads / error handlers).
            body = htmlToText(String(job.descriptionHtml));
          }
          break;
        }
      } catch {
        /* malformed blob — fall through to DOM extraction */
      }
    }

    if (!jobTitle) {
      jobTitle =
        ctx.document.querySelector("h2")?.textContent?.trim() ||
        ctx.document.title.split("|")[0].trim() ||
        "Untitled role";
    }
    if (!body) {
      body = ctx.document.querySelector("main")?.textContent ?? "";
    }

    return {
      platform: "ashby",
      sourceUrl: ctx.url,
      companyName,
      jobTitle,
      jdRawText: body.slice(0, 20000),
      detectedAt: new Date().toISOString(),
    };
  },
};
