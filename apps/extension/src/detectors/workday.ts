import type { Detector, PageContext } from "../types.js";

/**
 * Workday tenants each customize their copy, but every submission lands on
 * a page whose document title or body carries a variant of "Application
 * complete / submitted / thank you", and the URL gains /apply/ or
 * jobApplication state. Title match is the most stable single signal.
 */
export const workdayDetector: Detector = {
  id: "workday",
  isApplicationSubmitted(ctx: PageContext): boolean {
    const title = ctx.document.title ?? "";
    if (/application (?:complete|submitted|received)/i.test(title)) return true;
    const text = ctx.document.body?.innerText ?? "";
    return /thank you for (?:your|the) application|application has been (?:submitted|received)/i.test(
      text,
    );
  },
};
