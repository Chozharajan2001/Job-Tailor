import type { Detector, PageContext } from "../types.js";

/** Replaced in Task 10. */
export const leverDetector: Detector = {
  id: "lever",
  isApplicationSubmitted(_ctx: PageContext): boolean {
    return false;
  },
};
