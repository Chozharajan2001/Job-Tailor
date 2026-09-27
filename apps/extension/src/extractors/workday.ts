import type { Extractor, PageContext, ApplicationDraft } from "../types.js";

/** Replaced in Task 12. */
export const workdayExtractor: Extractor = {
  id: "workday",
  extract(_ctx: PageContext): ApplicationDraft {
    throw new Error("workday extractor not implemented yet");
  },
};
