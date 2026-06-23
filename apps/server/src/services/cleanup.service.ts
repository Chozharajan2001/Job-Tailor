import { CanonicalJob } from '../models/CanonicalJob.model.js';

export class CleanupService {
  /**
   * Marks jobs as inactive (isActive = false, expiredAt = now) if they have not been seen
   * since the threshold duration.
   * Returns the count of deactivated jobs.
   */
  static async cleanupStaleJobs(thresholdDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

    const result = await CanonicalJob.updateMany(
      {
        lastSeenAt: { $lt: cutoffDate },
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          expiredAt: new Date(),
        },
      }
    );

    return result.modifiedCount;
  }
}
