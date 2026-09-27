import type { Detector, PageContext } from "../types.js";

/**
 * Greenhouse application-submission confirmation. Two independent signals
 * (either wins):
 *  1. URL ends in /thank-you (the board's post-submit page)
 *  2. A visible "application complete/thanks" message in the page body
 */
export const greenhouseDetector: Detector = {
  id: "greenhouse",
  isApplicationSubmitted(ctx: PageContext): boolean {
    if (/\/thank-?you\/?$/i.test(ctx.url)) return true;
    const text = ctx.document.body?.innerText ?? "";
    return /thanks for applying|application (?:submitted|received|complete)/i.test(
      text,
    );
  },
};
