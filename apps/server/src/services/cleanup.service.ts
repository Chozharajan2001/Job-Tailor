import { CanonicalJob } from '../models/CanonicalJob.model.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';
import { URL } from 'url';

export class CleanupService {
  /**
   * Decays trust score for a source by a given amount.
   */
  static async decaySourceTrust(sourceId: any, amount: number): Promise<void> {
    if (!sourceId) return;
    try {
      const source = await SourceRegistry.findById(sourceId);
      if (source) {
        const newScore = Math.max(0, source.trustScore - amount);
        source.trustScore = parseFloat(newScore.toFixed(4));
        await source.save();
        console.log(`📉 TrustDecay: Source "${source.name}" trust score decayed by ${amount} to ${source.trustScore}`);
      }
    } catch (err) {
      console.error(`⚠️ TrustDecay: Failed to decay trust for source ${sourceId}:`, err);
    }
  }

  /**
   * Boosts trust score for a source by a given amount.
   */
  static async boostSourceTrust(sourceId: any, amount: number): Promise<void> {
    if (!sourceId) return;
    try {
      const source = await SourceRegistry.findById(sourceId);
      if (source) {
        const newScore = Math.min(1.0, source.trustScore + amount);
        source.trustScore = parseFloat(newScore.toFixed(4));
        await source.save();
        console.log(`📈 TrustBoost: Source "${source.name}" trust score boosted by ${amount} to ${source.trustScore}`);
      }
    } catch (err) {
      console.error(`⚠️ TrustBoost: Failed to boost trust for source ${sourceId}:`, err);
    }
  }

  /**
   * Marks jobs as inactive (isActive = false, expiredAt = now) if they have not been seen
   * since the threshold duration. Also checks active job URLs to verify link health.
   * Returns the count of deactivated jobs.
   */
  static async cleanupStaleJobs(thresholdDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

    // 1. Simple time-based stale cutoff
    const result = await CanonicalJob.updateMany(
      {
        lastSeenAt: { $lt: cutoffDate },
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          expiredAt: new Date(),
          verificationState: 'failed',
          verificationError: 'Time-based stale cutoff',
        },
      }
    );

    let deactivatedCount = result.modifiedCount;

    // 2. Asynchronous link health verification for active jobs older than thresholdDays / 2 (default 15 days)
    const linkCheckCutoff = new Date(Date.now() - Math.floor(thresholdDays / 2) * 24 * 60 * 60 * 1000);
    const activeJobsToCheck = await CanonicalJob.find({
      isActive: true,
      lastSeenAt: { $lt: linkCheckCutoff },
      $or: [
        { applyUrl: { $exists: true, $ne: '' } },
        { sourceUrl: { $exists: true, $ne: '' } },
      ],
    }).exec();

    if (activeJobsToCheck.length > 0) {
      for (const job of activeJobsToCheck) {
        const urlStr = job.applyUrl || job.sourceUrl;
        if (!urlStr || urlStr.startsWith('local://') || urlStr.startsWith('http://127.0.0.1')) {
          continue;
        }

        // Introduce a small 200ms delay to prevent target server rate-limiting
        await new Promise((resolve) => setTimeout(resolve, 200));

        try {
          // Perform lightweight request to check URL status
          const response = await fetch(urlStr, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          let shouldDeactivate = false;
          let deactivationReason = '';

          if (response.status === 404) {
            shouldDeactivate = true;
            deactivationReason = 'HTTP 404';
            console.log(`🔗 LinkVerifier: Job "${job.jobTitle}" URL returned 404. Deactivating.`);
          } else {
            // Check for homepage redirects (expired listings redirecting back to search portals)
            const finalUrl = response.url;
            if (finalUrl && finalUrl !== urlStr) {
              try {
                const origParsed = new URL(urlStr);
                const finalParsed = new URL(finalUrl);
                if (origParsed.pathname.length > 2 && (finalParsed.pathname === '/' || finalParsed.pathname === '')) {
                  shouldDeactivate = true;
                  deactivationReason = 'Homepage Redirect';
                  console.log(`🔗 LinkVerifier: Job "${job.jobTitle}" redirected to homepage: "${finalUrl}". Deactivating.`);
                }
              } catch (e) {
                // Ignore URL parse error
              }
            }
          }

          if (shouldDeactivate) {
            job.isActive = false;
            job.expiredAt = new Date();
            job.verificationState = 'failed';
            job.verificationAttempts += 1;
            job.lastVerifiedAt = new Date();
            job.verificationError = deactivationReason;
            await job.save();
            deactivatedCount++;

            // Decay trust score by 0.05
            await this.decaySourceTrust(job.sourceId, 0.05);
          } else {
            // Link is verified successfully
            job.verificationState = 'verified';
            job.verificationAttempts = 0;
            job.lastVerifiedAt = new Date();
            job.verificationError = undefined;
            await job.save();

            // Boost trust score by 0.01 (trust recovery)
            await this.boostSourceTrust(job.sourceId, 0.01);
          }
        } catch (err: any) {
          console.warn(`⚠️ LinkVerifier: Non-fatal ping check error for "${urlStr}" (Job: "${job.jobTitle}"):`, err);
          
          job.verificationAttempts += 1;
          job.lastVerifiedAt = new Date();
          job.verificationError = err.message || String(err);

          if (job.verificationAttempts >= 3) {
            job.isActive = false;
            job.expiredAt = new Date();
            job.verificationState = 'failed';
            deactivatedCount++;
            await job.save();

            // Decay trust score by 0.02 due to persistent network errors
            await this.decaySourceTrust(job.sourceId, 0.02);
          } else {
            await job.save();
          }
        }
      }
    }

    return deactivatedCount;
  }
}
