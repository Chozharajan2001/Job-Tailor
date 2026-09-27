import type { Detector, PageContext } from "../types.js";

/** Replaced in Task 12. */
export const workdayDetector: Detector = {
  id: "workday",
  isApplicationSubmitted(_ctx: PageContext): boolean {
    return false;
  },
};
