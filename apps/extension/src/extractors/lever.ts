import type { Extractor, PageContext, ApplicationDraft } from "../types.js";

/** Replaced in Task 10. */
export const leverExtractor: Extractor = {
  id: "lever",
  extract(_ctx: PageContext): ApplicationDraft {
    throw new Error("lever extractor not implemented yet");
  },
};
