import type { Detector, PageContext } from "../types.js";

/**
 * Replaced with real logic in Task 8. Until then it never fires, which is
 * safe: the popup simply won't appear on Greenhouse.
 */
export const greenhouseDetector: Detector = {
  id: "greenhouse",
  isApplicationSubmitted(_ctx: PageContext): boolean {
    return false;
  },
};
