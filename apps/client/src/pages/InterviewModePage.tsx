import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { FileText, Eye, Download, ArrowLeftRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
interface IApplication {
  _id: string;
  jobId: { _id: string; companyName: string; jobTitle: string; location?: string; workType?: string; jdRawText?: string; parsedJD?: unknown };
  resumeId: { _id: string; versionLabel?: string; atsScore?: { overallScore: number }; tailoredSummary?: string; skills?: Array<{ name: string }>; experience?: unknown[]; projects?: unknown[] };
  status: string;
  timelineEvents?: Array<{ event: string; description: string; eventDate: string }>;
}

export default function InterviewModePage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['application', id],
    queryFn: () => api.get<{ application: IApplication }>(`/applications/${id}`),
    enabled: !!id,
    retry: false,
  });

  const app = data?.data?.application;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Application Not Found</h2>
        <p className="text-muted-foreground">This application doesn't exist or was deleted.</p>
        <a href="/tracker" className="inline-block mt-4 text-primary hover:underline">← Back to Tracker</a>
      </div>
    );
  }

  const job = app.jobId;
  const resume = app.resumeId;

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800">
        <div className="flex items-center gap-3">
          <a href="/tracker" className="text-muted-foreground hover:text-white cursor-pointer flex items-center gap-1 text-sm">
            ← Back to Tracker
          </a>
          <span className="text-gray-700">|</span>
          <h1 className="font-semibold">{job.jobTitle}</h1>
          <span className="text-primary font-medium">@ {job.companyName}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${app.status === 'interview' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-800 text-gray-400'}`}>
            {app.status}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {resume?.atsScore && (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-300 border border-green-500/20 font-medium">
              ATS: {resume.atsScore.overallScore}/100
            </span>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <Eye className="w-3.5 h-3.5" /> Print View
          </button>
          {resume?.versionLabel && (
            <span className="text-xs text-muted-foreground">{resume.versionLabel}</span>
          )}
        </div>
      </header>

      {/* Split Screen */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden print:block">
        {/* Left Panel — JD */}
        <section className="overflow-y-auto p-8 border-r border-gray-800 print:border-r-0">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-sm text-green-400 uppercase tracking-wide font-semibold">
              <FileText className="w-4 h-4" /> Job Description
            </div>

            {/* JD Header */}
            <div className="space-y-1">
              <h2 className="text-2xl font-bold">{job.jobTitle}</h2>
              <p className="text-xl text-primary font-medium">{job.companyName}</p>
              {(job.location || job.workType) && (
                <div className="flex gap-2 mt-2 text-sm text-gray-400">
                  {job.location && <span>{job.location}</span>}
                  {job.workType && <span>· {job.workType}</span>}
                </div>
              )}
            </div>

            {/* Raw JD Text */}
            <article className="bg-gray-900 rounded-xl p-6 border border-gray-800 leading-relaxed text-sm text-gray-300">
              <pre className="whitespace-pre-wrap font-sans">{job.jdRawText || 'No raw JD text available.'}</pre>
            </article>
          </div>
        </section>

        {/* Divider (desktop only) */}
        <div className="hidden lg:flex absolute left-1/2 top-[60px] bottom-0 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-gray-700 to-transparent pointer-events-none z-10" />

        {/* Right Panel — Resume */}
        <section className="overflow-y-auto p-8 bg-white text-gray-900 print:bg-white">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-2 text-sm text-blue-600 uppercase tracking-wide font-semibold">
              <Eye className="w-4 h-4" /> Your Resume
            </div>

            {/* Resume Header */}
            <div className="border-b pb-4">
              <h2 className="text-2xl font-bold text-gray-900">Your Tailored Resume</h2>
              {resume.versionLabel && <p className="text-sm text-gray-500 mt-1">{resume.versionLabel}</p>}

              {/* Summary */}
              {resume.tailoredSummary && (
                <div className="mt-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                  <p className="text-sm text-gray-700 leading-relaxed italic">{resume.tailoredSummary}</p>
                </div>
              )}
            </div>

            {/* Skills Section */}
            {(resume.skills && resume.skills.length > 0) && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(resume.skills as Array<{ name: string }>).map((skill) => (
                    <span key={skill.name} className="px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-md font-medium">{skill.name}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Experience Section */}
            {(resume.experience && resume.experience.length > 0) && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Experience</h3>
                <div className="space-y-4">
                  {(resume.experience as Array<Record<string, unknown>>).map((exp, i) => (
                    <div key={i} className="border-l-2 border-gray-200 pl-4">
                      <h4 className="font-semibold text-base">{String(exp.role || '')}</h4>
                      <p className="text-sm text-gray-600">{String(exp.company || '')} · {String(exp.startDate || '')}{exp.endDate ? ` → ${String(exp.endDate)}` : ''}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Projects Section */}
            {(resume.projects && resume.projects.length > 0) && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Projects</h3>
                <div className="grid gap-3">
                  {(resume.projects as Array<Record<string, unknown>>).map((proj, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h4 className="font-semibold text-sm">{String(proj.name || '')}</h4>
                      <p className="text-xs text-gray-600 mt-0.5">{String(proj.description || '')}</p>
                      {(proj.techStack as string[])?.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {(proj.techStack as string[]).map((t) => (
                            <span key={t} className="text-[11px] px-1.5 py-0.5 bg-white border rounded text-gray-600">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fallback when no resume data */}
            {(!resume.tailoredSummary && (!resume.skills || resume.skills.length === 0)) && (
              <div className="text-center py-12 text-gray-400">
                <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No resume content available.</p>
                <p className="text-sm">Generate a tailored resume first to see it here.</p>
                <a href={`/tailor`} className="mt-3 inline-block px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90">Go to Resume Tailor</a>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
