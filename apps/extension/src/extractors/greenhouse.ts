import type { Extractor, PageContext, ApplicationDraft } from "../types.js";

/** Replaced in Task 9. Throws rather than returns junk so a wiring bug
 *  shows up loudly in the popup instead of silently seeding a bad draft. */
export const greenhouseExtractor: Extractor = {
  id: "greenhouse",
  extract(_ctx: PageContext): ApplicationDraft {
    throw new Error("greenhouse extractor not implemented yet");
  },
};
