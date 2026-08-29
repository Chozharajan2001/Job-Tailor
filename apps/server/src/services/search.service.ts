import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { Profile } from "../models/Profile.model.js";
import { getSynonymRegexString, escapeRegex } from "../utils/skill-matcher.js";

export interface ISearchParams {
  q?: string;
  location?: string;
  workType?: "all" | "remote" | "hybrid" | "onsite";
  sourceId?: string;
  isActive?: boolean;
  freshnessDays?: number;
  sortBy?: "relevance" | "date";
  page?: number;
  limit?: number;
  userId?: string;
  employmentType?: string;
  salaryMin?: number;
}

/**
 * Upper bound on documents pulled into memory for in-app relevance scoring.
 * Candidates are taken newest-first; this keeps scoring cost O(cap) instead
 * of O(collection) while fresh jobs (the useful ones) are always included.
 */
const SCORING_CANDIDATE_CAP = 500;

export class SearchService {
  /**
   * Search and rank canonical jobs based on keywords, synonyms, filters, freshness, and profile skills overlap.
   */
  static async searchJobs(params: ISearchParams) {
    const q = params.q?.trim();
    const location = params.location?.trim();
    const workType = params.workType || "all";
    const sourceId = params.sourceId;
    const isActive = params.isActive !== false; // default to true
    const freshnessDays = params.freshnessDays;
    const sortBy = params.sortBy || "relevance";
    const page = params.page || 1;
    const limit = params.limit || 20;
    const userId = params.userId;
    const employmentType = params.employmentType;
    const salaryMin = params.salaryMin;

    const query: Record<string, any> = {
      isActive,
      verificationState: { $nin: ["failed", "suspicious"] },
    };

    // Apply location regex filter (escaped — user input must never be
    // interpreted as raw regex)
    if (location) {
      query.location = { $regex: escapeRegex(location), $options: "i" };
    }

    // Apply work type filter
    if (workType && workType !== "all") {
      query.workType = workType;
    }

    // Apply sourceId registry filter
    if (sourceId && sourceId !== "all") {
      query.sourceId = sourceId;
    }

    // Apply freshness filter (lastSeenAt within X days)
    if (freshnessDays) {
      const cutOffDate = new Date(
        Date.now() - freshnessDays * 24 * 60 * 60 * 1000,
      );
      query.lastSeenAt = { $gte: cutOffDate };
    }

    // Apply employment type filter
    if (employmentType && employmentType !== "all") {
      query.employmentType = employmentType;
    }

    // Keyword filtering with synonym expansion
    if (q) {
      const words = q.split(/\s+/).filter((w) => w.trim().length > 0);
      const regexPatterns = words.map((w) => getSynonymRegexString(w));
      const pattern = regexPatterns.join("|");
      const regex = new RegExp(pattern, "i");

      query.$or = [
        { jobTitle: regex },
        { companyName: regex },
        { description: regex },
      ];
    }

    // Apply salary minimum filter
    if (salaryMin) {
      const salaryFilter = {
        $or: [
          { "salaryRange.min": { $gte: salaryMin } },
          { "salaryRange.max": { $gte: salaryMin } },
        ],
      };
      if (query.$or) {
        const keywordFilter = { $or: query.$or };
        delete query.$or;
        query.$and = [keywordFilter, salaryFilter];
      } else {
        query.$or = salaryFilter.$or;
      }
    }

    // Fetch matching jobs and populate source trust score.
    // Bounded candidate set (newest first) so in-app scoring stays cheap;
    // for `date` sort the DB sort+pagination below is exact.
    const rawJobs = await CanonicalJob.find(query)
      .populate("sourceId")
      .sort({ lastSeenAt: -1 })
      .limit(SCORING_CANDIDATE_CAP)
      .lean()
      .exec();

    // Fetch user profile if provided for skill overlap boost
    let userSkills: string[] = [];
    if (userId) {
      const profile = await Profile.findOne({ userId }).lean().exec();
      if (profile && profile.skills) {
        userSkills = profile.skills.map((s: any) =>
          s.name.toLowerCase().trim(),
        );
      }
    }

    // Score jobs
    const scoredJobs = rawJobs.map((job: any) => {
      let score = 0;

      if (q) {
        const qLower = q.toLowerCase();
        const titleLower = (job.jobTitle || "").toLowerCase();
        const companyLower = (job.companyName || "").toLowerCase();
        const descLower = (job.description || "").toLowerCase();

        // 1. Exact / inclusion title match
        if (titleLower === qLower) {
          score += 100;
        } else if (titleLower.includes(qLower)) {
          score += 50;
        }

        // 2. Exact / inclusion company match
        if (companyLower === qLower) {
          score += 50;
        } else if (companyLower.includes(qLower)) {
          score += 20;
        }

        // 3. Keyword / Synonym overlap
        const words = q.split(/\s+/).filter((w) => w.trim().length >= 2);
        for (const word of words) {
          const patternStr = getSynonymRegexString(word);
          const regex = new RegExp(patternStr, "i");

          if (regex.test(titleLower)) score += 15;
          if (regex.test(companyLower)) score += 10;
          if (regex.test(descLower)) score += 2;

          if (job.structuredJD?.requiredSkills) {
            const hasSkill = job.structuredJD.requiredSkills.some((s: string) =>
              regex.test(s),
            );
            if (hasSkill) score += 10;
          }
        }
      }

      // 4. Personalized Profile Skill Match Boost (determinstic, no LLM)
      let skillsMatchedCount = 0;
      if (userSkills.length > 0) {
        const titleLower = (job.jobTitle || "").toLowerCase();
        const descLower = (job.description || "").toLowerCase();

        for (const skill of userSkills) {
          const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const skillRegex = new RegExp(`\\b${escapedSkill}\\b`, "i");

          const inTitle = skillRegex.test(titleLower);
          const inDesc = skillRegex.test(descLower);
          const inRequiredSkills = job.structuredJD?.requiredSkills?.some(
            (s: string) => s.toLowerCase().trim() === skill,
          );

          if (inTitle) {
            score += 15;
            skillsMatchedCount++;
          } else if (inRequiredSkills) {
            score += 10;
            skillsMatchedCount++;
          } else if (inDesc) {
            score += 5;
            skillsMatchedCount++;
          }
        }
      }

      // 5. Freshness boost: jobs up to 30 days old get decay points
      const postedDate = job.postedDate || job.createdAt || new Date();
      const ageInMs = Date.now() - new Date(postedDate).getTime();
      const ageInDays = Math.max(0, ageInMs / (24 * 60 * 60 * 1000));
      if (ageInDays < 30) {
        score += 30 - ageInDays;
      }

      // 6. Source trust boost
      const sourceRegistry = job.sourceId;
      if (sourceRegistry && typeof sourceRegistry.trustScore === "number") {
        score += sourceRegistry.trustScore * 10;
      }

      return {
        ...job,
        relevanceScore: score,
        skillsMatchedCount,
      };
    });

    // Sort according to requested strategy
    if (sortBy === "date") {
      scoredJobs.sort((a, b) => {
        const dateA = new Date(a.postedDate || a.lastSeenAt || 0).getTime();
        const dateB = new Date(b.postedDate || b.lastSeenAt || 0).getTime();
        return dateB - dateA;
      });
    } else {
      scoredJobs.sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        const dateA = new Date(a.postedDate || a.lastSeenAt || 0).getTime();
        const dateB = new Date(b.postedDate || b.lastSeenAt || 0).getTime();
        return dateB - dateA;
      });
    }

    // Paginate results
    const total = scoredJobs.length;
    const startIndex = (page - 1) * limit;
    const paginatedJobs = scoredJobs.slice(startIndex, startIndex + limit);

    return {
      jobs: paginatedJobs,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  }
}
