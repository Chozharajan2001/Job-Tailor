import cron from "node-cron";
import { CleanupService } from "../services/cleanup.service.js";

/**
 * Stale-job maintenance as a scheduled background job.
 *
 * Previously this ran inline inside an HTTP request, which blocked the
 * request for the entire duration of hundreds of sequential link checks.
 * Now it runs daily at 03:00, and the admin endpoint can trigger it
 * on-demand (fire-and-forget).
 */

const DEFAULT_THRESHOLD_DAYS = 30;

let isRunning = false;
let scheduled = false;

export async function runStaleCleanup(
  thresholdDays: number = DEFAULT_THRESHOLD_DAYS,
): Promise<number> {
  if (isRunning) {
    console.log("⏭️  StaleCleanup: already running — skipping this trigger");
    return 0;
  }

  isRunning = true;
  try {
    const started = Date.now();
    const deactivated = await CleanupService.cleanupStaleJobs(thresholdDays);
    console.log(
      `✅ StaleCleanup: deactivated ${deactivated} jobs in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    return deactivated;
  } catch (err) {
    console.error("❌ StaleCleanup: run failed:", err);
    return 0;
  } finally {
    isRunning = false;
  }
}

/** True when a cleanup run is in progress (used by the admin endpoint). */
export function isCleanupRunning(): boolean {
  return isRunning;
}

/**
 * Schedule the daily cleanup. Safe to call multiple times (idempotent).
 */
export function startStaleCleanupScheduler(): void {
  if (scheduled) return;
  scheduled = true;

  // Daily at 03:00 server time
  cron.schedule("0 3 * * *", () => {
    runStaleCleanup().catch((err) =>
      console.error("❌ StaleCleanup: scheduled run crashed:", err),
    );
  });

  console.log("⏰ StaleCleanup: scheduled daily at 03:00");
}
