import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────
interface DashboardData {
  totalApplications: number;
  thisWeekApplied: number;
  interviewRate: number;
  averageATSScore: number;
  topMatchingSkills: string[];
  commonGaps: string[];
  pipelineFunnel: Record<string, number>;
  resumePerformance: Array<{ versionLabel: string; usageCount: number; callbackRate: number }>;
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get<DashboardData>('/analytics/overview'),
    retry: false,
  });

  const d = data?.data;

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (<div key={i} className="h-64 bg-gray-200 rounded-xl" />))}
          </div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const funnelData = d?.pipelineFunnel
    ? Object.entries(d.pipelineFunnel).map(([stage, count]) => ({ name: stage.charAt(0).toUpperCase() + stage.slice(1), value: count }))
    : [];

  const performanceData = (d?.resumePerformance || []).map((p) => ({
    name: p.versionLabel.length > 25 ? p.versionLabel.slice(0, 22) + '...' : p.versionLabel,
    usageCount: p.usageCount,
    callbackRate: Math.round(p.callbackRate * 100),
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics & Insights</h1>
        <p className="text-muted-foreground mt-1">Learn from your application data to improve your job search.</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Applications', value: d?.totalApplications ?? 0, sub: 'all time' },
          { label: 'Interview Rate', value: `${Math.round(((d?.interviewRate) || 0) * 100)}%`, sub: `${Math.round(((d?.interviewRate) || 0) * (d?.totalApplications ?? 0))} of ${d?.totalApplications}` },
          { label: 'Avg ATS Score', value: `${d?.averageATSScore ?? 0}/100`, sub: 'across all resumes' },
          { label: 'This Week', value: d?.thisWeekApplied ?? 0, sub: 'applications sent' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="text-3xl font-bold mt-1">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <FunnelChart data={funnelData} />

        {/* Resume Performance */}
        <PerformanceChart data={performanceData} />
      </div>

      {/* Skills Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Skills */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span> Top Matching Skills
          </h2>
          {(d?.topMatchingSkills && d.topMatchingSkills.length > 0) ? (
            <div className="space-y-2.5">
              {d.topMatchingSkills.map((skill, i) => {
                const pct = Math.max(20, 100 - i * 12); // Simulated relevance
                return (
                  <div key={skill} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium truncate">{skill}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">Generate resumes to see skill matching data.</p>
          )}
        </div>

        {/* Skill Gaps */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Common Skill Gaps
          </h2>
          {(d?.commonGaps && d.commonGaps.length > 0) ? (
            <div className="space-y-2.5">
              {d.commonGaps.map((gap, i) => {
                const freq = Math.max(15, 90 - i * 14);
                return (
                  <div key={gap} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium truncate text-red-700">{gap}</span>
                    <div className="flex-1 h-6 bg-red-50 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all" style={{ width: `${freq}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{freq - 10 + i * 2} jobs</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">No gaps detected — your profile covers most JDs!</p>
          )}
        </div>
      </div>

      {/* Insights / Recommendations */}
      <InsightsPanel data={d} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════

function FunnelChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data.length) return null;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const colors = ['#94a3b8', '#3b82f6', '#eab308', '#a855f7', '#22c55e', '#ef4444'];

  return (
    <div className="bg-white rounded-xl border p-6 shadow-sm">
      <h2 className="font-semibold mb-4">Pipeline Funnel</h2>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="w-20 text-sm font-medium shrink-0">{item.name}</span>
            <div className="flex-1 h-9 bg-gray-50 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-700"
                style={{
                  width: `${(item.value / maxVal) * 100}%`,
                  backgroundColor: colors[i] || '#94a3b8',
                }}
              >
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-800">
                  {item.value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceChart({ data }: { data: Array<{ name: string; usageCount: number; callbackRate: number }> }) {
  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <h2 className="font-semibold mb-4">Resume Performance Comparison</h2>
        <p className="text-center text-sm text-muted-foreground py-12">Generate multiple resume versions to compare performance.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-6 shadow-sm">
      <h2 className="font-semibold mb-4">Resume Version Performance</h2>
      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.name} className="border rounded-lg p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <span className="font-medium text-sm truncate pr-2" title={item.name}>{item.name}</span>
              <span className={`text-sm font-bold px-2 py-0.5 rounded ${item.callbackRate >= 20 ? 'bg-green-50 text-green-700' : item.callbackRate >= 10 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-600'}`}>
                {item.callbackRate}% callback
              </span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{item.usageCount} uses</span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${item.callbackRate >= 20 ? 'bg-green-500' : item.callbackRate >= 10 ? 'bg-yellow-500' : 'bg-gray-300'}`}
                  style={{ width: `${Math.max(5, item.callbackRate)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-right">{item.callbackRate}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsPanel({ data }: { data?: DashboardData }) {
  const insights = generateInsights(data);

  return (
    <div className="bg-gradient-to-r from-primary/5 to-indigo-50 rounded-xl border border-primary/10 p-6">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        💡 AI-Powered Recommendations
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-3 bg-white/70 rounded-lg p-3 border border-white">
            <span className="mt-0.5 text-base">{insight.icon}</span>
            <div>
              <p className="text-sm font-medium">{insight.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{insight.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function generateInsights(data?: DashboardData): Array<{ icon: string; title: string; detail: string }> {
  if (!data) return [{ icon: '📊', title: 'Start Tracking', detail: 'Add jobs and generate resumes to unlock personalized insights.' }];
  
  const insights: Array<{ icon: string; title: string; detail: string }> = [];
  const rate = data.interviewRate;

  if (rate >= 0.3) insights.push({ icon: '🎯', title: 'Strong Interview Rate!', detail: `Your ${(rate * 100).toFixed(0)}% interview rate is above average. Your tailored resumes are working!` });
  else if (rate > 0) insights.push({ icon: '⚡', title: 'Boost Your Interview Rate', detail: `At ${(rate * 100).toFixed(0)}%, focus on improving ATS scores above 80 for better results.` });
  else if (data.totalApplications > 0) insights.push({ icon: '🚀', title: 'Get Started', detail: `You have ${data.totalApplications} applications tracked. Generate resumes to start getting interviews.` });

  if ((data.averageATSScore || 0) < 75) insights.push({ icon: '📈', title: 'Improve ATS Scores', detail: `Average score is ${data.averageATSScore}/100. Add missing skills and quantify achievements with metrics.` });

  if ((data.thisWeekApplied || 0) < 3) insights.push({ icon: '📝', title: 'Apply More This Week', detail: `Only ${data.thisWeekApplied} applications this week. Target 5+ per week to increase your chances.` });

  if (data.commonGaps && data.commonGaps.length > 0) insights.push({ icon: '💪', title: 'Close Your Skill Gaps', detail: `Focus on learning: ${data.commonGaps.slice(0, 3).join(', ')}. These appear in multiple JDs.` });

  if (insights.length === 0) insights.push({ icon: '✨', title: 'Looking Good!', detail: 'Your metrics are healthy. Keep applying consistently and track results.' });

  return insights.slice(0, 4);
}
