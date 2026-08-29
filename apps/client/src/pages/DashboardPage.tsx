import {
  LayoutDashboard,
  FileText,
  Briefcase,
  TrendingUp,
  Target,
  AlertCircle,
  Plus,
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAnalyticsOverview } from "../hooks/useAnalyticsOverview";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: dashboard, isLoading } = useAnalyticsOverview();

  const d = dashboard?.data;

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Applications",
      value: d?.totalApplications ?? 0,
      icon: Briefcase,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Applied This Week",
      value: d?.thisWeekApplied ?? 0,
      icon: FileText,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Interview Rate",
      value: `${Math.round((d?.interviewRate || 0) * 100)}%`,
      icon: TrendingUp,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Avg ATS Score",
      value: `${d?.averageATSScore ?? 0}/100`,
      icon: Target,
      color: "bg-orange-50 text-orange-600",
    },
  ];

  const funnelStages = [
    { key: "saved", label: "Saved", color: "bg-gray-100 border-gray-300" },
    { key: "applied", label: "Applied", color: "bg-blue-50 border-blue-300" },
    {
      key: "screening",
      label: "Screening",
      color: "bg-yellow-50 border-yellow-300",
    },
    {
      key: "interview",
      label: "Interview",
      color: "bg-purple-50 border-purple-300",
    },
    { key: "offer", label: "Offer", color: "bg-green-50 border-green-300" },
    { key: "rejected", label: "Rejected", color: "bg-red-50 border-red-300" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's your job search overview.
          </p>
        </div>
        <button
          onClick={() => navigate("/jobs")}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Job
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {card.label}
              </span>
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Funnel */}
      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Pipeline Funnel</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {funnelStages.map((stage) => {
            const count = d?.pipelineFunnel?.[stage.key] ?? 0;
            return (
              <div
                key={stage.key}
                className={`rounded-lg border p-4 text-center ${stage.color}`}
              >
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs font-medium mt-1">{stage.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column: Skills + Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Skills */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Top Matching Skills
          </h2>
          {d?.topMatchingSkills && d.topMatchingSkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {d.topMatchingSkills.map((item) => {
                const skill = typeof item === "string" ? item : item.skill;
                return (
                  <span
                    key={skill}
                    className="px-3 py-1.5 bg-green-50 text-green-700 text-sm font-medium rounded-full border border-green-200"
                  >
                    {skill}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Add jobs and generate resumes to see matching skills.
            </p>
          )}
        </div>

        {/* Skill Gaps */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" /> Common Skill
            Gaps
          </h2>
          {d?.commonGaps && d.commonGaps.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {d.commonGaps.map((item) => {
                const gap = typeof item === "string" ? item : item.skill;
                return (
                  <span
                    key={gap}
                    className="px-3 py-1.5 bg-orange-50 text-orange-700 text-sm font-medium rounded-full border border-orange-200"
                  >
                    {gap}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No gaps detected yet — keep building your profile!
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/profile"
          className="block p-5 bg-white rounded-xl border hover:border-primary/30 transition-colors group"
        >
          <h3 className="font-semibold group-hover:text-primary">
            Update Master Profile
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Keep your skills & experience current
          </p>
        </Link>
        <Link
          to="/jobs"
          className="block p-5 bg-white rounded-xl border hover:border-primary/30 transition-colors group"
        >
          <h3 className="font-semibold group-hover:text-primary">
            Paste a New JD
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Parse and analyze a job description
          </p>
        </Link>
        <Link
          to="/tailor"
          className="block p-5 bg-white rounded-xl border hover:border-primary/30 transition-colors group"
        >
          <h3 className="font-semibold group-hover:text-primary">
            Generate Tailored Resume
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-tailor for any saved job
          </p>
        </Link>
      </div>
    </div>
  );
}
