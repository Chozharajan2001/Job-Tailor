import type { Extractor, PageContext, ApplicationDraft } from "../types.js";

/** Replaced in Task 11. */
export const ashbyExtractor: Extractor = {
  id: "ashby",
  extract(_ctx: PageContext): ApplicationDraft {
    throw new Error("ashby extractor not implemented yet");
  },
};
