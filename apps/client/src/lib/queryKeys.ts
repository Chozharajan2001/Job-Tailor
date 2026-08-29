/**
 * Central TanStack Query key factory.
 * Always use these keys for queries AND invalidations so they never drift.
 */
export const queryKeys = {
  jobs: {
    /** User's saved jobs list (paginated) */
    list: (params: { page: number; limit: number; status?: string }) =>
      ["jobs", "list", params] as const,
    /** Small job set for pickers (e.g. resume tailor) */
    picker: (limit: number) => ["jobs", "picker", limit] as const,
    detail: (jobId: string) => ["jobs", "detail", jobId] as const,
  },
  resumes: {
    byJob: (jobId: string | null) => ["resumes", jobId ?? "all"] as const,
    profile: () => ["resumes", "profile"] as const,
  },
  analytics: {
    overview: () => ["analytics", "overview"] as const,
    statusBreakdown: () => ["analytics", "status-breakdown"] as const,
    skillGap: () => ["analytics", "skill-gap"] as const,
    resumePerformance: () => ["analytics", "resume-performance"] as const,
  },
  profile: {
    current: () => ["profile"] as const,
  },
  applications: {
    all: (status?: string) => ["applications", status ?? "all"] as const,
  },
  search: {
    alerts: () => ["search", "alerts"] as const,
    saved: () => ["search", "saved"] as const,
    results: (params: Record<string, unknown>) =>
      ["search", "results", params] as const,
  },
} as const;
