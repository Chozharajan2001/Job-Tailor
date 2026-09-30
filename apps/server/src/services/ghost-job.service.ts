export interface GhostJobInput {
  jobTitle: string;
  description?: string;
  location?: string;
  employmentType?: "full-time" | "part-time" | "contract" | "internship";
  postedDate?: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  descriptionHashChanges?: number;
  userGhostVerdict?: "real" | "ghost";
}

export interface GhostContext {
  sameRoleCount: number;
  now: Date;
}

export interface GhostVerdict {
  risk: number;
  reasons: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SPAN_THRESHOLD_DAYS = 60;
const SHORT_SPAN_THRESHOLD_DAYS = 45;

const WEIGHTS = {
  span: 0.45,
  repost: 0.3,
  evergreen: 0.15,
  unchanged: 0.1,
};

const EVERGREEN =
  /always hiring|ongoing pipeline|rolling|we review continuously|year[- ]round/i;

/**
 * Advisory staleness estimate. Deterministic, computed from stored fields
 * only: no fetches and no LLM, so the poll-time cost invariant holds.
 * It cannot prove a listing is fake - see TODO_PLAN #16 honest limits.
 *
 * Two calibration rules from the 2026-09-30 baseline measurement:
 * - the span anchor is postedDate ?? firstSeenAt: firstSeenAt is the first
 *   sighting time, which is "today" for everything on a fresh index, while
 *   postedDate carries the provider's real listing age;
 * - the unchanged signal requires an actual re-sighting (lastSeenAt after
 *   firstSeenAt): on first sighting the change counter is 0 because there
 *   is no history yet, not because the text never changed.
 */
export function scoreGhostSignals(
  job: GhostJobInput,
  ctx: GhostContext,
): GhostVerdict {
  if (job.userGhostVerdict === "real") {
    return { risk: 0, reasons: ["you marked this as still hiring"] };
  }

  const reasons: string[] = [];
  const threshold =
    job.employmentType === "contract" || job.employmentType === "internship"
      ? SHORT_SPAN_THRESHOLD_DAYS
      : SPAN_THRESHOLD_DAYS;

  const anchor = job.postedDate ?? job.firstSeenAt;
  const spanDays = Math.max(
    0,
    (ctx.now.getTime() - new Date(anchor).getTime()) / DAY_MS,
  );
  const span = Math.min(1, spanDays / threshold);

  const repost = ctx.sameRoleCount >= 3 ? 1 : ctx.sameRoleCount === 2 ? 0.5 : 0;

  const evergreenHit = EVERGREEN.test(
    `${job.jobTitle} ${job.description ?? ""}`,
  );

  const resighted =
    new Date(job.lastSeenAt).getTime() > new Date(job.firstSeenAt).getTime();
  const unchanged =
    resighted &&
    spanDays >= threshold &&
    (job.descriptionHashChanges ?? 0) === 0;

  if (spanDays >= threshold) {
    reasons.push(`listed ${Math.round(spanDays)} days`);
  }
  if (ctx.sameRoleCount >= 2) {
    reasons.push(`reposted ${ctx.sameRoleCount} times`);
  }
  if (evergreenHit) {
    reasons.push("evergreen posting copy");
  }
  if (unchanged) {
    reasons.push("text unchanged");
  }

  const raw =
    WEIGHTS.span * span +
    WEIGHTS.repost * repost +
    WEIGHTS.evergreen * (evergreenHit ? 1 : 0) +
    WEIGHTS.unchanged * (unchanged ? 1 : 0);

  return {
    risk: Math.min(1, Math.max(0, Number(raw.toFixed(4)))),
    reasons,
  };
}
