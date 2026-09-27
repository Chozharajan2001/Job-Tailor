import type { Detector, PageContext } from "../types.js";

/** Replaced in Task 11. */
export const ashbyDetector: Detector = {
  id: "ashby",
  isApplicationSubmitted(_ctx: PageContext): boolean {
    return false;
  },
};
