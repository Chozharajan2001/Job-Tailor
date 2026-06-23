import { CanonicalJob } from '../models/CanonicalJob.model.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';
import { ICanonicalJob } from '@jobtailor/shared-types';

export interface ISearchParams {
  q?: string;
  location?: string;
  workType?: 'all' | 'remote' | 'hybrid' | 'onsite';
  sourceId?: string;
  isActive?: boolean;
  freshnessDays?: number;
  sortBy?: 'relevance' | 'date';
  page?: number;
  limit?: number;
}

export class SearchService {
  /**
   * Search and rank canonical jobs based on keywords, freshness, and trust score.
   */
  static async searchJobs(params: ISearchParams) {
    const q = params.q?.trim();
    const location = params.location?.trim();
    const workType = params.workType || 'all';
    const sourceId = params.sourceId;
    const isActive = params.isActive !== false; // default to true
    const freshnessDays = params.freshnessDays;
    const sortBy = params.sortBy || 'relevance';
    const page = params.page || 1;
    const limit = params.limit || 20;

    const query: Record<string, any> = { isActive };

    // Apply location regex filter
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    // Apply work type filter
    if (workType && workType !== 'all') {
      query.workType = workType;
    }

    // Apply sourceId registry filter
    if (sourceId && sourceId !== 'all') {
      query.sourceId = sourceId;
    }

    // Apply freshness filter (lastSeenAt within X days)
    if (freshnessDays) {
      const cutOffDate = new Date(Date.now() - freshnessDays * 24 * 60 * 60 * 1000);
      query.lastSeenAt = { $gte: cutOffDate };
    }

    // Keyword filtering
    if (q) {
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { jobTitle: { $regex: escapedQ, $options: 'i' } },
        { companyName: { $regex: escapedQ, $options: 'i' } },
        { description: { $regex: escapedQ, $options: 'i' } },
      ];
    }

    // Fetch matching jobs and populate source trust score
    const rawJobs = await CanonicalJob.find(query)
      .populate('sourceId')
      .lean()
      .exec();

    // Score jobs
    const scoredJobs = rawJobs.map((job: any) => {
      let score = 0;
      
      if (q) {
        const qLower = q.toLowerCase();
        const titleLower = (job.jobTitle || '').toLowerCase();
        const companyLower = (job.companyName || '').toLowerCase();
        const descLower = (job.description || '').toLowerCase();

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

        // 3. Keyword overlap
        const keywords = qLower.split(/\s+/).filter(k => k.length > 2);
        for (const keyword of keywords) {
          if (titleLower.includes(keyword)) score += 15;
          if (companyLower.includes(keyword)) score += 10;
          if (descLower.includes(keyword)) score += 2;

          // Skills overlap from structured JD if parsed
          if (job.structuredJD?.requiredSkills) {
            const hasSkill = job.structuredJD.requiredSkills.some(
              (s: string) => s.toLowerCase().includes(keyword)
            );
            if (hasSkill) score += 10;
          }
        }
      }

      // 4. Freshness boost: jobs up to 30 days old get decay points
      const postedDate = job.postedDate || job.createdAt || new Date();
      const ageInMs = Date.now() - new Date(postedDate).getTime();
      const ageInDays = Math.max(0, ageInMs / (24 * 60 * 60 * 1000));
      if (ageInDays < 30) {
        score += (30 - ageInDays);
      }

      // 5. Source trust boost
      const sourceRegistry = job.sourceId;
      if (sourceRegistry && typeof sourceRegistry.trustScore === 'number') {
        score += sourceRegistry.trustScore * 10;
      }

      return {
        ...job,
        relevanceScore: score,
      };
    });

    // Sort according to requested strategy
    if (sortBy === 'date') {
      // Primary sort by postedDate/lastSeenAt descending
      scoredJobs.sort((a, b) => {
        const dateA = new Date(a.postedDate || a.lastSeenAt || 0).getTime();
        const dateB = new Date(b.postedDate || b.lastSeenAt || 0).getTime();
        return dateB - dateA;
      });
    } else {
      // Primary sort by relevanceScore descending, fallback to date
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
