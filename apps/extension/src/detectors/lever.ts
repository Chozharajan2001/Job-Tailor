import type { Detector, PageContext } from "../types.js";

/**
 * Lever confirmation pages live at /<company>/<postingId>/thank-you.
 * Older Lever hosts also show a "Thanks for your application" block.
 */
export const leverDetector: Detector = {
  id: "lever",
  isApplicationSubmitted(ctx: PageContext): boolean {
    if (/\/thank-?you\/?$/i.test(ctx.url)) return true;
    const text = ctx.document.body?.innerText ?? "";
    return /thanks for your application|application (?:submitted|received|complete)/i.test(
      text,
    );
  },
};
