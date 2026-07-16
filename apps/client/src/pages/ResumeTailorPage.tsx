import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Download, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────
interface IJob { _id: string; companyName: string; jobTitle: string; status: string; parsedJD: unknown | null; }
interface IMatchedSkill { skill: string; presentInResume: boolean; presentInJD: boolean; weight: number; }
interface IMissingSkill { skill: string; required: boolean; suggestion: string; }
interface IWeakSkill { skill: string; userYearsExp: number; requiredYearsExp: number; gap: number; suggestion: string; }
interface IATSScore {
  overallScore: number; keywordMatchScore: number; semanticMatchScore: number;
  sectionCompletenessScore: number; formatScore: number;
  breakdown: {
    matchedSkills: IMatchedSkill[];
    missingSkills: IMissingSkill[];
    weakSkills: IWeakSkill[];
    actionItems: string[];
  };
}
interface IResume { _id: string; versionLabel: string; atsScore: IATSScore; tailoredSummary: string; skills: unknown[]; experience: unknown[]; projects: unknown[]; status: string; createdAt: string; pdfUrl?: string; }

export default function ResumeTailorPage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  // ─── Fetch jobs that have been parsed ───────────────────────
  const { data: jobsRes } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<{ jobs: IJob[] }>('/jobs?limit=100'),
  });

  const allJobs = jobsRes?.data?.jobs || [];
  const parsedJobs = allJobs.filter((j) => j.parsedJD);

  // ─── Fetch resumes for selected job ─────────────────────────
  const { data: resumesRes, isLoading: loadingResumes } = useQuery({
    queryKey: ['resumes', selectedJobId],
    queryFn: () => api.get<{ resumes: IResume[] }>(`/resumes?jobId=${selectedJobId}`),
    enabled: !!selectedJobId,
  });
  const existingResumes = resumesRes?.data?.resumes || [];
  const latestResume = existingResumes[0];

  // ─── Generate Resume Mutation ───────────────────────────────
  const generateMutation = useMutation({
    mutationFn: () => api.post<{ resume: IResume }>('/resumes/generate', { jobId: selectedJobId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  // ─── Download PDF Mutation ──────────────────────────────────
  const downloadPDFMutation = useMutation({
    mutationFn: (resumeId: string) => api.post<{ pdfUrl: string }>(`/resumes/${resumeId}/pdf`),
    onSuccess: (response) => {
      const url = response.data.pdfUrl;
      if (url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = url;
        const isHtml = url.includes('text/html');
        link.download = isHtml ? 'resume.html' : 'resume.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        window.open(url, '_blank');
      }
    },
    onError: (error: any) => {
      console.error('PDF download failed:', error);
      alert('Failed to generate PDF. Please try again.');
    },
  });

  const updateResumeMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      const response = await api.put<{ resume: IResume }>(`/resumes/${id}`, body);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-resumes', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume summary updated successfully!');
    },
    onError: (error: any) => {
      alert(error.response?.data?.error?.message || 'Failed to update resume summary');
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resume Tailor</h1>
        <p className="text-muted-foreground mt-1">Select a parsed job to auto-generate a tailored resume with ATS scoring.</p>
      </div>

      {/* Job Selector */}
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <label className="block text-sm font-medium mb-2">Select a Parsed Job</label>
        {parsedJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No parsed jobs yet.{' '}
            <Link to="/jobs" className="text-primary hover:underline">Go to Jobs</Link> and paste a JD first.
          </p>
        ) : (
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full max-w-lg px-4 py-2.5 border rounded-lg text-sm bg-white"
          >
            <option value="">— Choose a job —</option>
            {parsedJobs.map((job) => (
              <option key={job._id} value={job._id}>
                {job.jobTitle} at {job.companyName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {!selectedJobId ? (
        <div className="border rounded-xl h-80 flex items-center justify-center text-muted-foreground">
          <p>Select a job above to start tailoring your resume.</p>
        </div>
      ) : loadingResumes && existingResumes.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Generate + Existing Versions */}
          <div className="space-y-4">
            {/* Generate Button */}
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full py-3 bg-gradient-to-r from-primary to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {generateMutation.isPending ? '⚙️ Generating...' : '🪄 Generate Tailored Resume'}
            </button>

            {generateMutation.isError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 space-y-2">
                <p className="font-semibold">Failed to generate resume</p>
                <p className="text-xs text-red-600">Make sure your master profile has details (Skills, Experience, Summary) set up.</p>
                <div className="pt-1">
                  <Link to="/profile" className="text-xs px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 inline-block transition-colors">
                    Go to Profile Setup →
                  </Link>
                </div>
              </div>
            )}

            {latestResume && !generateMutation.isPending && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  to={`/tracker?jobId=${selectedJobId}&resumeId=${latestResume._id}`}
                  className="flex-1 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  ✓ Create Application & Track Progress
                </Link>
                <button
                  onClick={() => downloadPDFMutation.mutate(latestResume._id)}
                  disabled={downloadPDFMutation.isPending}
                  className="sm:w-auto py-3 px-5 bg-white border-2 border-primary text-primary font-semibold rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  title="Export the latest version as PDF"
                >
                  {downloadPDFMutation.isPending ? (
                    <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Export PDF
                </button>
              </div>
            )}

            {/* Existing Resume Versions */}
            {existingResumes.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Generated Versions ({existingResumes.length})</h3>
                 {existingResumes.map((resume) => (
                  <ResumeCard 
                    key={resume._id} 
                    resume={resume}
                    onDownloadPDF={() => downloadPDFMutation.mutate(resume._id)}
                    isDownloading={downloadPDFMutation.isPending}
                    onUpdateResume={(body) => updateResumeMutation.mutate({ id: resume._id, body })}
                    isUpdating={updateResumeMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: Latest ATS Score */}
          {latestResume && (
            <ATSDashboard score={latestResume.atsScore} versionLabel={latestResume.versionLabel} />
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════

function ResumeCard({ 
  resume, 
  onDownloadPDF,
  isDownloading,
  onUpdateResume,
  isUpdating = false
}: { 
  resume: IResume; 
  onDownloadPDF: () => void;
  isDownloading: boolean;
  onUpdateResume: (body: any) => void;
  isUpdating?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState(resume.tailoredSummary || '');
  const s = resume.atsScore;

  // Keep state in sync with prop updates
  useEffect(() => {
    setEditedSummary(resume.tailoredSummary || '');
  }, [resume.tailoredSummary]);

  function handleSave() {
    onUpdateResume({ tailoredSummary: editedSummary });
    setIsEditing(false);
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-all bg-white ${expanded ? 'shadow-md border-primary/20' : 'hover:border-slate-300'}`}>
      <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm text-slate-800">{resume.versionLabel}</h4>
            <span className="text-[10px] text-muted-foreground font-mono">v{resume._id.slice(-4)} · {new Date(resume.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <ATSScoreBadge score={s?.overallScore || 0} />
            {/* Edit Trigger Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                setIsEditing(!isEditing);
              }}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-semibold transition-colors cursor-pointer"
            >
              {isEditing ? 'Cancel Edit' : '📝 Edit'}
            </button>
            {/* Download PDF Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadPDF();
              }}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
              title="Download PDF"
            >
              {isDownloading ? (
                <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-3 bg-slate-50/20">
          {/* Tailored Summary */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Tailored Summary</p>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={4}
                  className="w-full text-xs p-3 border rounded-lg bg-white outline-none resize-none focus:border-primary focus:ring-1 focus:ring-primary/20 text-slate-800 leading-relaxed font-sans"
                  placeholder="Edit your tailored professional summary..."
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs px-3 py-1 text-muted-foreground hover:text-foreground cursor-pointer font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isUpdating}
                    className="text-xs px-4 py-1 bg-primary text-white font-semibold rounded hover:bg-primary/95 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isUpdating ? 'Saving...' : '✓ Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100">{resume.tailoredSummary || 'No summary generated.'}</p>
            )}
          </div>

          {/* Score Breakdown */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <ScoreBar label="Keyword Match" value={s?.keywordMatchScore || 0} color="#22c55e" />
            <ScoreBar label="Semantic" value={s?.semanticMatchScore || 0} color="#a855f7" />
            <ScoreBar label="Sections" value={s?.sectionCompletenessScore || 0} color="#3b82f6" />
            <ScoreBar label="Format" value={s?.formatScore || 0} color="#f97316" />
          </div>
        </div>
      )}
    </div>
  );
}

function ATSScoreBadge({ score }: { score: number }) {
  let color = 'text-green-700 bg-green-50 border-green-200';
  if (score < 70) color = 'text-yellow-700 bg-yellow-50 border-yellow-200';
  if (score < 50) color = 'text-red-700 bg-red-50 border-red-200';

  return (
    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${color}`}>
      ATS: {score}/100
    </span>
  );
}

function ATSDashboard({ score, versionLabel }: { score: IATSScore; versionLabel: string }) {
  const breakdown = score.breakdown;

  return (
    <div className="border rounded-xl p-5 space-y-5 shadow-sm bg-white">
      <h3 className="font-semibold">ATS Analysis — {versionLabel}</h3>

      {/* Overall Score Gauge */}
      <div className="flex items-center gap-6">
        <div className={`relative w-28 h-28 rounded-full flex items-center justify-center ${scoreGaugeColor(score.overallScore)}`}>
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={score.overallScore >= 75 ? '#22c55e' : score.overallScore >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="2.5" strokeDasharray={`${score.overallScore}, 100`} strokeLinecap="round" />
          </svg>
          <span className="text-2xl font-black">{score.overallScore}</span>
        </div>
        <div className="space-y-1.5 flex-1">
          <ScoreBar label="Overall Score" value={score.overallScore} color={score.overallScore >= 75 ? '#22c55e' : score.overallScore >= 50 ? '#f59e0b' : '#ef4444'} showValue />
          <ScoreBar label="Keywords" value={score.keywordMatchScore} color="#22c55e" showValue />
          <ScoreBar label="Semantic" value={score.semanticMatchScore} color="#a855f7" showValue />
          <ScoreBar label="Format" value={score.formatScore} color="#f97316" showValue />
        </div>
      </div>

      {/* Matched Skills */}
      {breakdown.matchedSkills.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-2">✅ Matched Skills ({breakdown.matchedSkills.filter(s => s.presentInResume).length}/{breakdown.matchedSkills.length})</h4>
          <div className="flex flex-wrap gap-1.5">
            {breakdown.matchedSkills.map((ms) => (
              <span key={ms.skill} title={`${ms.presentInResume ? '✓ In resume' : '✗ Not in resume'} · JD requires this`}
                className={`text-xs px-2 py-1 rounded-md border ${ms.presentInResume ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-400 border-red-200 line-through'}`}
              >
                {ms.skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Missing Skills */}
      {breakdown.missingSkills.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2">❌ Missing Skills</h4>
          <div className="space-y-1.5">
            {breakdown.missingSkills.map((ms) => (
              <div key={ms.skill} className="flex items-start gap-2 text-sm bg-red-50/50 p-2 rounded-lg">
                <span className="font-medium text-red-700 mt-0.5">{ms.skill}</span>
                {ms.required && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded shrink-0">Required</span>}
                <span className="text-muted-foreground text-xs">{ms.suggestion}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Weakness Box */}
      {breakdown.weakSkills.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-2">⚠️ Experience Gaps</h4>
          <div className="space-y-1.5">
            {breakdown.weakSkills.map((ws) => (
              <div key={ws.skill} className="flex items-start gap-2 text-sm bg-orange-50/50 p-2 rounded-lg">
                <span className="font-medium text-orange-700 mt-0.5">{ws.skill}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded shrink-0">
                  {ws.userYearsExp}y vs {ws.requiredYearsExp}y needed (-{ws.gap}y)
                </span>
                <span className="text-muted-foreground text-xs flex-1">{ws.suggestion}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Items */}
      {breakdown.actionItems.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">💡 Action Items to Improve Score</h4>
          <ul className="space-y-1.5">
            {breakdown.actionItems.map((item, i) => (
              <li key={i} className="text-sm flex items-start gap-2 bg-blue-50/50 p-2 rounded-lg">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScoreBar({ label, value, color, showValue }: { label: string; value: number; color: string; showValue?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {showValue && <span className="font-mono font-medium">{value}%</span>}
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function scoreGaugeColor(score: number): string {
  if (score >= 75) return 'bg-green-50 text-green-700';
  if (score >= 50) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}
