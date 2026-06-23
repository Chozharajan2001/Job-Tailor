import mongoose from 'mongoose';
import { SearchQueryLog } from '../models/SearchQueryLog.model.js';
import { JobInteractionLog } from '../models/JobInteractionLog.model.js';
import { CanonicalJob } from '../models/CanonicalJob.model.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';
import { CleanupService } from './cleanup.service.js';

export class AnalyticsService {
  /**
   * Logs a search query event.
   */
  static async logSearchQuery(
    userId: string,
    query: string,
    filters: Record<string, any>,
    resultsCount: number
  ): Promise<void> {
    try {
      await SearchQueryLog.create({
        userId: new mongoose.Types.ObjectId(userId),
        query: query ? query.trim() : '',
        filters,
        resultsCount,
        clickedJobIds: [],
      });
    } catch (err) {
      console.error('⚠️ AnalyticsService: Failed to log search query:', err);
    }
  }

  /**
   * Logs a user interaction with a canonical job.
   * If interactionType is flag_expired or flag_spam, updates the job state
   * and decays the trust score of the source.
   */
  static async logInteraction(
    userId: string,
    canonicalJobId: string,
    interactionType: 'click' | 'import' | 'flag_expired' | 'flag_spam' | 'dismiss',
    feedbackComment?: string
  ): Promise<void> {
    try {
      const jobIdObj = new mongoose.Types.ObjectId(canonicalJobId);
      
      // Save log entry
      await JobInteractionLog.create({
        userId: new mongoose.Types.ObjectId(userId),
        canonicalJobId: jobIdObj,
        interactionType,
        feedbackComment,
      });

      // Handle flagging impacts
      if (interactionType === 'flag_expired' || interactionType === 'flag_spam') {
        const job = await CanonicalJob.findById(jobIdObj);
        if (job) {
          if (interactionType === 'flag_expired') {
            job.verificationState = 'failed';
            job.isActive = false;
            job.expiredAt = new Date();
            job.verificationError = feedbackComment || 'Flagged as expired by user';
            await job.save();
            
            // Decay trust by 0.05
            await CleanupService.decaySourceTrust(job.sourceId, 0.05);
          } else { // flag_spam
            job.verificationState = 'suspicious';
            job.isActive = false; // Exclude from search/feed
            job.expiredAt = new Date();
            job.verificationError = feedbackComment || 'Flagged as spam by user';
            await job.save();

            // Decay trust by 0.10
            await CleanupService.decaySourceTrust(job.sourceId, 0.10);
          }
        }
      }
    } catch (err) {
      console.error('⚠️ AnalyticsService: Failed to log interaction:', err);
    }
  }

  /**
   * Aggregates search analytics metrics for the dashboard.
   */
  static async getAnalyticsDashboard(): Promise<any> {
    try {
      // 1. Total search query count
      const totalQueries = await SearchQueryLog.countDocuments({});

      // 2. Top search queries
      const topQueries = await SearchQueryLog.aggregate([
        { $match: { query: { $ne: '' } } },
        { $group: { _id: '$query', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]);

      // 3. Verification state breakdown
      const rawStates = await CanonicalJob.aggregate([
        { $group: { _id: '$verificationState', count: { $sum: 1 } } },
      ]);

      const verificationStates = {
        unverified: 0,
        verified: 0,
        failed: 0,
        suspicious: 0,
      };

      rawStates.forEach((s) => {
        if (s._id in verificationStates) {
          verificationStates[s._id as keyof typeof verificationStates] = s.count;
        }
      });

      // 4. Source metrics and health details
      const sources = await SourceRegistry.find({}).exec();
      const sourceHealth = await Promise.all(
        sources.map(async (src) => {
          const stats = await CanonicalJob.aggregate([
            { $match: { sourceId: src._id } },
            { $group: { _id: '$verificationState', count: { $sum: 1 } } },
          ]);

          const statesCount = {
            unverified: 0,
            verified: 0,
            failed: 0,
            suspicious: 0,
          };

          stats.forEach((st) => {
            if (st._id in statesCount) {
              statesCount[st._id as keyof typeof statesCount] = st.count;
            }
          });

          return {
            _id: src._id.toString(),
            name: src.name,
            baseUrl: src.baseUrl,
            trustScore: src.trustScore,
            isEnabled: src.isEnabled,
            sourceType: src.sourceType,
            states: statesCount,
          };
        })
      );

      // 5. Click-Through Rate (CTR) approximation
      const clicks = await JobInteractionLog.countDocuments({ interactionType: 'click' });
      const imports = await JobInteractionLog.countDocuments({ interactionType: 'import' });
      const ctr = totalQueries > 0 ? parseFloat((clicks / totalQueries).toFixed(4)) : 0;
      const importRate = totalQueries > 0 ? parseFloat((imports / totalQueries).toFixed(4)) : 0;

      return {
        totalQueries,
        clicks,
        imports,
        ctr,
        importRate,
        topQueries: topQueries.map(q => ({ query: q._id, count: q.count })),
        verificationStates,
        sourceHealth,
      };
    } catch (err) {
      console.error('⚠️ AnalyticsService: Failed to compile dashboard metrics:', err);
      throw err;
    }
  }
}
