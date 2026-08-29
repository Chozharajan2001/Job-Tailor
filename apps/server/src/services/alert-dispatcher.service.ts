import { SavedSearch } from "../models/SavedSearch.model.js";
import { Alert } from "../models/Alert.model.js";
import { Watch } from "../models/Watch.model.js";
import { ICanonicalJobDocument } from "../models/CanonicalJob.model.js";
import { buildKeywordMatcher, escapeRegex } from "../utils/skill-matcher.js";

export class AlertDispatcherService {
  /**
   * Evaluates a newly ingested job against all users' saved searches and active watches,
   * creating Alert entries for any matches.
   */
  static async dispatchAlertsForJob(job: ICanonicalJobDocument): Promise<void> {
    try {
      // NOTE (scaling path): at higher user counts, push matching down into
      // per-user queries (e.g. index saved-search keywords) instead of
      // scanning every search/watch per ingested job.
      const [savedSearches, activeWatches] = await Promise.all([
        SavedSearch.find().select("userId query filters").lean().exec(),
        Watch.find({ isEnabled: true })
          .select("userId type value")
          .lean()
          .exec(),
      ]);

      const titleLower = (job.jobTitle || "").toLowerCase();
      const companyLower = (job.companyName || "").toLowerCase();
      const descLower = (job.description || "").toLowerCase();
      const locationLower = (job.location || "").toLowerCase();
      const workTypeLower = (job.workType || "").toLowerCase();

      const alertsToCreate = [];
      const userJobPairs = new Set<string>(); // Keep track of User_Job alerts to avoid duplicate creations

      // 1. Process Saved Searches
      for (const search of savedSearches) {
        let isMatch = true;

        // Evaluate Query (Keyword + Synonyms — shared matcher with search)
        if (search.query) {
          const queryLower = search.query.toLowerCase().trim();

          const matchesTerm = (term: string): boolean => {
            const regex = buildKeywordMatcher(term);
            return (
              regex.test(titleLower) ||
              regex.test(companyLower) ||
              regex.test(descLower)
            );
          };

          const terms = queryLower.split(/\s+/).filter((t) => t.length >= 2);
          if (terms.length > 0) {
            const queryMatches = terms.some((t) => matchesTerm(t));
            if (!queryMatches) {
              isMatch = false;
            }
          } else {
            if (
              !titleLower.includes(queryLower) &&
              !companyLower.includes(queryLower) &&
              !descLower.includes(queryLower)
            ) {
              isMatch = false;
            }
          }
        }

        // Evaluate Location Filter
        if (isMatch && search.filters?.location) {
          const locFilter = search.filters.location.toLowerCase().trim();
          if (!locationLower.includes(locFilter)) {
            isMatch = false;
          }
        }

        // Evaluate Work Type Filter
        if (isMatch && search.filters?.workType) {
          const wtFilter = search.filters.workType.toLowerCase().trim();
          if (workTypeLower !== wtFilter) {
            isMatch = false;
          }
        }

        // Evaluate Company Name Filter
        if (isMatch && search.filters?.companyName) {
          const compFilter = search.filters.companyName.toLowerCase().trim();
          if (!companyLower.includes(compFilter)) {
            isMatch = false;
          }
        }

        if (isMatch) {
          const key = `${search.userId.toString()}_${job._id.toString()}`;
          if (!userJobPairs.has(key)) {
            userJobPairs.add(key);
            alertsToCreate.push({
              userId: search.userId,
              savedSearchId: search._id,
              canonicalJobId: job._id,
              isRead: false,
            });
          }
        }
      }

      // 2. Process Active Watches (Company or Title Keyword Matches)
      for (const watch of activeWatches) {
        let isMatch = false;
        const watchVal = watch.value.toLowerCase().trim();

        if (watch.type === "company") {
          // Company watch matches if the company name contains the keyword
          if (companyLower.includes(watchVal)) {
            isMatch = true;
          }
        } else if (watch.type === "title") {
          // Title watch uses exact word boundary match
          const escaped = escapeRegex(watchVal);
          const regex = new RegExp(`\\b${escaped}\\b`, "i");
          if (regex.test(titleLower)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          const key = `${watch.userId.toString()}_${job._id.toString()}`;
          if (!userJobPairs.has(key)) {
            userJobPairs.add(key);
            alertsToCreate.push({
              userId: watch.userId,
              watchId: watch._id,
              canonicalJobId: job._id,
              isRead: false,
            });
          }
        }
      }

      // Batch insert matching alerts
      if (alertsToCreate.length > 0) {
        await Alert.insertMany(alertsToCreate);
        console.log(
          `📡 AlertDispatcher: Triggered ${alertsToCreate.length} alerts for job "${job.jobTitle}"`,
        );
      }
    } catch (error) {
      console.error("❌ AlertDispatcher: Failed to dispatch alerts:", error);
    }
  }
}
