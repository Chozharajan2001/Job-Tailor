import { CanonicalJob } from '../models/CanonicalJob.model.js';
import { Profile } from '../models/Profile.model.js';
import { Watch } from '../models/Watch.model.js';
import { Job } from '../models/Job.model.js';

export class FeedService {
  /**
   * Generates a personalized job feed for the user based on profile skills and active watches.
   * Excludes jobs already imported into the user's tracker.
   */
  static async getPersonalizedFeed(userId: string, page = 1, limit = 20) {
    // 1. Fetch user's profile, active watches, and tracker jobs
    const [profile, watches, userJobs] = await Promise.all([
      Profile.findOne({ userId }).lean().exec(),
      Watch.find({ userId, isEnabled: true }).lean().exec(),
      Job.find({ userId }).lean().exec(),
    ]);

    const userSkills = profile?.skills
      ? profile.skills.map((s: any) => s.name.toLowerCase().trim())
      : [];

    const companyWatches = watches
      .filter((w) => w.type === 'company')
      .map((w) => w.value.toLowerCase().trim());

    const titleWatches = watches
      .filter((w) => w.type === 'title')
      .map((w) => w.value.toLowerCase().trim());

    // 2. Map imported jobs to exclude
    const importedUrls = new Set<string>();
    const importedKeys = new Set<string>();

    for (const uj of userJobs) {
      if (uj.jobLink) {
        importedUrls.add(uj.jobLink.trim().toLowerCase());
      }
      const titleClean = (uj.jobTitle || '').trim().toLowerCase();
      const companyClean = (uj.companyName || '').trim().toLowerCase();
      if (titleClean && companyClean) {
        importedKeys.add(`${companyClean}_${titleClean}`);
      }
    }

    // 3. Fetch active canonical jobs
    const activeJobs = await CanonicalJob.find({
      isActive: true,
      verificationState: { $nin: ['failed', 'suspicious'] }
    })
      .populate('sourceId')
      .lean()
      .exec();

    // 4. Filter and score jobs
    const scoredFeed = activeJobs
      .filter((job: any) => {
        // Exclude if already imported
        const applyUrlLower = (job.applyUrl || '').trim().toLowerCase();
        const sourceUrlLower = (job.sourceUrl || '').trim().toLowerCase();
        
        if (importedUrls.has(applyUrlLower) || (sourceUrlLower && importedUrls.has(sourceUrlLower))) {
          return false;
        }

        const titleLower = (job.jobTitle || '').trim().toLowerCase();
        const companyLower = (job.companyName || '').trim().toLowerCase();
        const key = `${companyLower}_${titleLower}`;
        if (importedKeys.has(key)) {
          return false;
        }

        return true;
      })
      .map((job: any) => {
        let score = 0;
        const titleLower = (job.jobTitle || '').toLowerCase();
        const companyLower = (job.companyName || '').toLowerCase();
        const descLower = (job.description || '').toLowerCase();

        // A. Watches Boost
        let watchMatched = false;
        // Company Watches (substring matching)
        for (const company of companyWatches) {
          if (companyLower.includes(company)) {
            score += 200;
            watchMatched = true;
          }
        }
        // Title Watches (regex matching using word boundary)
        for (const title of titleWatches) {
          const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (regex.test(titleLower)) {
            score += 150;
            watchMatched = true;
          }
        }

        // B. Profile Skills Boost (consistent with SearchService ranking)
        let skillsMatchedCount = 0;
        if (userSkills.length > 0) {
          for (const skill of userSkills) {
            const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const skillRegex = new RegExp(`\\b${escapedSkill}\\b`, 'i');

            const inTitle = skillRegex.test(titleLower);
            const inDesc = skillRegex.test(descLower);
            const inRequiredSkills = job.structuredJD?.requiredSkills?.some(
              (s: string) => s.toLowerCase().trim() === skill
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

        // C. Freshness boost (up to 30 points decay)
        const postedDate = job.postedDate || job.createdAt || new Date();
        const ageInMs = Date.now() - new Date(postedDate).getTime();
        const ageInDays = Math.max(0, ageInMs / (24 * 60 * 60 * 1000));
        if (ageInDays < 30) {
          score += (30 - ageInDays);
        }

        // D. Source trust boost
        const sourceRegistry = job.sourceId;
        if (sourceRegistry && typeof sourceRegistry.trustScore === 'number') {
          score += sourceRegistry.trustScore * 10;
        }

        return {
          ...job,
          relevanceScore: score,
          skillsMatchedCount,
          isWatchMatch: watchMatched,
        };
      });

    // Sort feed items by relevance score
    scoredFeed.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      const dateA = new Date(a.postedDate || a.lastSeenAt || 0).getTime();
      const dateB = new Date(b.postedDate || b.lastSeenAt || 0).getTime();
      return dateB - dateA;
    });

    // 5. Paginate results
    const total = scoredFeed.length;
    const startIndex = (page - 1) * limit;
    const paginatedFeed = scoredFeed.slice(startIndex, startIndex + limit);

    return {
      feed: paginatedFeed,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  }
}
