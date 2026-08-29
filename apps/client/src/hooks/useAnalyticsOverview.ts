import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { queryKeys } from "../lib/queryKeys";

// ─── Shared types (single source of truth for the overview endpoint) ──
export interface SkillCount {
  skill: string;
  count: number;
}

export interface AnalyticsOverview {
  totalApplications: number;
  thisWeekApplied: number;
  interviewRate: number;
  offerRate: number;
  averageATSScore: number;
  topMatchingSkills: Array<string | SkillCount>;
  commonGaps: Array<string | SkillCount>;
  pipelineFunnel: Record<string, number>;
  resumePerformance?: Array<{
    versionLabel: string;
    usageCount: number;
    callbackRate: number;
  }>;
}

/**
 * Shared analytics overview query — Dashboard and Analytics pages use the
 * SAME cache key so data is fetched once and never diverges.
 */
export function useAnalyticsOverview() {
  return useQuery({
    queryKey: queryKeys.analytics.overview(),
    queryFn: () => api.get<AnalyticsOverview>("/analytics/overview"),
    retry: false,
  });
}
