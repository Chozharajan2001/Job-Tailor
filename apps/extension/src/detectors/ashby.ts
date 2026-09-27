import type { Detector, PageContext } from "../types.js";

/**
 * Ashby applications confirm at /applications/success/<id> (and the
 * legacy /job-posting pages redirect there after submit).
 */
export const ashbyDetector: Detector = {
  id: "ashby",
  isApplicationSubmitted(ctx: PageContext): boolean {
    if (/\/applications\/success\//i.test(ctx.url)) return true;
    const text = ctx.document.body?.innerText ?? "";
    return /application (?:submitted|received|complete)|thank you for applying/i.test(
      text,
    );
  },
};
