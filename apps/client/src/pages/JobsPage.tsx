import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Upload, FileText, X } from 'lucide-react';
import ResumeUploadModal from '../components/ResumeUploadModal';

// ─── Types ────────────────────────────────────────────────────
interface IParsedJD {
  summary: string;
  seniorityLevel: string;
  focusWeights: { frontend: number; backend: number; devops: number; ai: number; mobile: number };
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  niceToHaves: string[];
  tone: string;
}

interface IJob {
  _id: string;
  companyName: string;
  jobTitle: string;
  location: string;
  workType: string;
  employmentType: string;
  jdRawText: string;
  parsedJD: IParsedJD | null;
  status: string;
  savedAt: string;
}

interface IResume {
  _id: string;
  versionLabel: string;
  atsScore?: { overallScore: number };
  pdfUrl?: string;
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // ─── Fetch Jobs ─────────────────────────────────────────────
  const { data: jobsRes, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get<{ jobs: IJob[]; pagination: unknown }>('/jobs?limit=50'),
  });
  const jobs = jobsRes?.data?.jobs || [];

  // ─── Fetch Resumes for dropdown ─────────────────────────────
  const { data: resumesRes } = useQuery({
    queryKey: ['resumes'],
    queryFn: () => api.get<{ resumes: IResume[] }>('/resumes'),
  });
  const resumes = resumesRes?.data?.resumes || [];

  // ─── Create Job Mutation ─────────────────────────────────────
  const createJobMutation = useMutation({
    mutationFn: (data: {
      companyName: string; jobTitle: string; location: string;
      workType: string; employmentType: string; jdRawText: string; jobLink?: string;
      attachedResumeId?: string;
    }) => api.post<{ job: IJob }>('/jobs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      setShowModal(false);
    },
  });

  // ─── Parse JD Mutation ───────────────────────────────────────
  const parseJDMutation = useMutation({
    mutationFn: (jobId: string) => api.post<IParsedJD>(`/jobs/${jobId}/parse`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['jobs'] }); },
  });

  // ─── Create Application Mutation ────────────────────────────
  const createAppMutation = useMutation({
    mutationFn: (data: { jobId: string; resumeId?: string; status?: string }) =>
      api.post('/applications', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowApplicationModal(false);
    },
  });

  const selectedJob = selectedJobId ? jobs.find((j) => j._id === selectedJobId) : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-muted-foreground mt-1">{jobs.length} jobs tracked</p>
        </div>
        <div className="flex gap-3">
          {/* Upload Resume Button */}
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Resume
          </button>
          
          {/* Add Job Button */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Job
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job List */}
        <div className="lg:col-span-1 space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse border rounded-lg p-4 h-28 bg-gray-100" />
            ))
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 border rounded-lg">
              <p className="text-muted-foreground mb-3">No jobs yet</p>
              <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm cursor-pointer hover:bg-primary/90">Add Your First Job</button>
            </div>
          ) : (
            jobs.map((job) => (
              <button
                key={job._id}
                onClick={() => setSelectedJobId(job._id)}
                className={`w-full text-left border rounded-lg p-4 transition-all hover:shadow-md cursor-pointer ${
                  selectedJobId === job._id ? 'border-primary ring-1 ring-primary/20' : 'hover:border-gray-300'
                }`}
              >
                <h3 className="font-semibold text-sm truncate">{job.jobTitle}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{job.companyName}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{job.location}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{job.workType}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor(job.status)}`}>{job.status}</span>
                </div>
                {!job.parsedJD && (
                  <span className="inline-block mt-2 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Not parsed</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Job Detail / Parsed JD Panel */}
        <div className="lg:col-span-2">
          {selectedJob ? (
            <JobDetailPanel
              job={selectedJob}
              isParsing={parseJDMutation.isPending}
              onParse={() => parseJDMutation.mutate(selectedJob._id)}
              onCreateApplication={() => {
                setSelectedJobId(selectedJob._id);
                setShowApplicationModal(true);
              }}
            />
          ) : (
            <div className="border rounded-xl h-[500px] flex items-center justify-center text-muted-foreground">
              <p>Select a job to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* JD Paste Modal */}
      {showModal && (
        <JDPasteModal
          onSubmit={(data) => createJobMutation.mutate(data)}
          isLoading={createJobMutation.isPending}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Create Application Modal */}
      {showApplicationModal && selectedJob && (
        <CreateApplicationModal
          job={selectedJob}
          resumes={resumes}
          onSubmit={(data) => createAppMutation.mutate({ ...data, jobId: selectedJob._id })}
          isLoading={createAppMutation.isPending}
          onClose={() => setShowApplicationModal(false)}
        />
      )}

      {/* Resume Upload Modal */}
      {showUploadModal && (
        <ResumeUploadModal 
          onClose={() => setShowUploadModal(false)}
          onSuccess={(pdfUrl) => {
            console.log('Resume uploaded:', pdfUrl);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

function statusColor(status: string): string {
  const map: Record<string, string> = {
    saved: 'bg-gray-100 text-gray-700', applied: 'bg-blue-50 text-blue-700', screening: 'bg-yellow-50 text-yellow-700',
    interview: 'bg-purple-50 text-purple-700', offer: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
}

function JobDetailPanel({ job, isParsing, onParse, onCreateApplication }: { 
  job: IJob; 
  isParsing: boolean; 
  onParse: () => void;
  onCreateApplication: () => void;
}) {
  if (!job.parsedJD) {
    return (
      <div className="border rounded-xl p-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{job.jobTitle}</h2>
            <p className="text-lg text-primary font-medium">{job.companyName}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-sm px-2 py-0.5 rounded-full bg-gray-100">{job.location}</span>
              <span className="text-sm px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{job.employmentType} · {job.workType}</span>
            </div>
          </div>
        </div>

        {/* Raw JD Text */}
        <div>
          <h3 className="font-semibold mb-2">Raw Job Description</h3>
          <pre className="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap max-h-80 overflow-y-auto border">{job.jdRawText}</pre>
        </div>

        {/* Parse Button */}
        <button
          onClick={onParse}
          disabled={isParsing}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isParsing ? '🔄 Parsing with AI...' : '✨ Parse JD with AI — Extract Skills & Requirements'}
        </button>
      </div>
    );
  }

  const jd = job.parsedJD;

  return (
    <div className="border rounded-xl p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{job.jobTitle}</h2>
          <p className="text-lg text-primary font-medium">{job.companyName}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{job.location}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{jd.seniorityLevel} level</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">{jd.tone} tone</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCreateApplication}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
          >
            📝 Create Application
          </button>
          <a href="/tailor" className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors">
            Tailor Resume →
          </a>
        </div>
      </div>

      {/* Summary */}
      <section>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Summary</h3>
        <p className="text-sm leading-relaxed bg-blue-50/50 p-3 rounded-lg border border-blue-100">{jd.summary}</p>
      </section>

      {/* Focus Weights Bar */}
      <section>
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Focus Distribution</h3>
        <div className="space-y-2">
          {(Object.entries(jd.focusWeights) as [string, number][]).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-16 text-sm capitalize text-right">{key}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(value, 5)}%`,
                    backgroundColor: focusColor(key),
                  }}
                />
              </div>
              <span className="w-10 text-sm font-mono text-right">{value}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-red-600 mb-2">Required Skills ({jd.requiredSkills.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {jd.requiredSkills.map((skill) => (
              <span key={skill} className="px-2.5 py-1 bg-red-50 text-red-700 text-sm rounded-md border border-red-200 font-medium">{skill}</span>
            ))}
          </div>
        </section>
        <section>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-blue-600 mb-2">Preferred Skills ({jd.preferredSkills.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {jd.preferredSkills.map((skill) => (
              <span key={skill} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-sm rounded-md border border-blue-200">{skill}</span>
            ))}
          </div>
        </section>
      </div>

      {/* Responsibilities & Qualifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jd.responsibilities.length > 0 && (
          <section>
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Responsibilities</h3>
            <ul className="space-y-1.5">
              {jd.responsibilities.map((r, i) => (
                <li key={i} className="text-sm flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />{r}</li>
              ))}
            </ul>
          </section>
        )}
        {jd.qualifications.length > 0 && (
          <section>
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Qualifications</h3>
            <ul className="space-y-1.5">
              {jd.qualifications.map((q, i) => (
                <li key={i} className="text-sm flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />{q}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Apply Button */}
      <button
        onClick={onCreateApplication}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors cursor-pointer"
      >
        Apply to this Job
      </button>
    </div>
  );
}

function JDPasteModal({ onSubmit, isLoading, onClose }: {
  onSubmit: (data: {
    companyName: string;
    jobTitle: string;
    location: string;
    workType: string;
    employmentType: string;
    jdRawText: string;
    jobLink?: string;
    attachedResumeId?: string;
  }) => void; isLoading: boolean; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ companyName: '', jobTitle: '', location: '', workType: 'remote', employmentType: 'full-time', jdRawText: '', jobLink: '' });
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Fetch existing resumes for selection
  const { data: resumesRes } = useQuery({
    queryKey: ['resumes'],
    queryFn: () => api.get<{ resumes: IResume[] }>('/resumes'),
  });
  const resumes = resumesRes?.data?.resumes || [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName || !form.jobTitle || !form.jdRawText) return;
    onSubmit({
      ...form,
      attachedResumeId: selectedResumeId || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Add New Job</h2>
          <p className="text-sm text-muted-foreground">Paste the job description and optionally attach a resume.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Company Name *" value={form.companyName} onChange={(e) => setForm(f => ({...f, companyName: e.target.value}))} className="px-4 py-2.5 border rounded-lg text-sm" />
            <input required placeholder="Job Title *" value={form.jobTitle} onChange={(e) => setForm(f => ({...f, jobTitle: e.target.value}))} className="px-4 py-2.5 border rounded-lg text-sm" />
            <input placeholder="Location" value={form.location} onChange={(e) => setForm(f => ({...f, location: e.target.value}))} className="px-4 py-2.5 border rounded-lg text-sm" />
            <input placeholder="Job Link (optional)" value={form.jobLink} onChange={(e) => setForm(f => ({...f, jobLink: e.target.value}))} className="px-4 py-2.5 border rounded-lg text-sm" />
            <select value={form.workType} onChange={(e) => setForm(f => ({...f, workType: e.target.value}))} className="px-4 py-2.5 border rounded-lg text-sm">
              {['remote', 'hybrid', 'onsite'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={form.employmentType} onChange={(e) => setForm(f => ({...f, employmentType: e.target.value}))} className="px-4 py-2.5 border rounded-lg text-sm">
              {['full-time', 'part-time', 'contract', 'internship'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Resume Attachment Section */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <label className="block text-sm font-medium mb-2">Attach Resume (Optional)</label>
            
            {selectedResumeId ? (
              // Show selected resume with remove option
              <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {resumes.find(r => r._id === selectedResumeId)?.versionLabel || 'Selected Resume'}
                  </p>
                  <p className="text-xs text-muted-foreground">This resume will be used for ATS scoring</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedResumeId('')}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Remove resume"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ) : (
              // Show resume selection or upload options
              <div className="space-y-3">
                {resumes.length > 0 ? (
                  <select
                    value={selectedResumeId}
                    onChange={(e) => setSelectedResumeId(e.target.value)}
                    className="w-full px-4 py-2.5 border rounded-lg text-sm bg-white"
                  >
                    <option value="">Select an existing resume</option>
                    {resumes.map((resume) => (
                      <option key={resume._id} value={resume._id}>
                        {resume.versionLabel}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-muted-foreground">No resumes available yet.</p>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">or</span>
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg hover:border-primary hover:text-primary transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    Upload New Resume
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Job Description *</label>
            <textarea
              required rows={10}
              value={form.jdRawText}
              onChange={(e) => setForm(f => ({...f, jdRawText: e.target.value}))}
              placeholder="Paste the full job description here..."
              className="w-full px-4 py-2.5 border rounded-lg text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer">Cancel</button>
            <button type="submit" disabled={isLoading || !form.jdRawText.trim()} className="px-6 py-2.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
              {isLoading ? 'Adding...' : '+ Add Job'}
            </button>
          </div>
        </form>
      </div>

      {/* Resume Upload Modal */}
      {showUploadModal && (
        <ResumeUploadModal 
          onClose={() => setShowUploadModal(false)}
          onSuccess={(pdfUrl) => {
            // Refresh resumes list after upload
            queryClient.invalidateQueries({ queryKey: ['resumes'] });
            setShowUploadModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateApplicationModal({
  job,
  resumes,
  onSubmit,
  isLoading,
  onClose,
}: {
  job: IJob;
  resumes: IResume[];
  onSubmit: (data: { resumeId?: string; status?: string }) => void;
  isLoading: boolean;
  onClose: () => void;
}) {
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [status, setStatus] = useState<string>('applied');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      resumeId: selectedResumeId || undefined,
      status,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Create Application</h2>
          <p className="text-sm text-muted-foreground mt-1">{job.jobTitle} at {job.companyName}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Resume Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Resume (Optional)</label>
            {resumes.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                <p className="text-yellow-800">No resumes found. You can:</p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-yellow-700">
                  <li>Create a tailored resume first</li>
                  <li>Or submit without a resume and add one later</li>
                </ul>
              </div>
            ) : (
              <>
                <select
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg text-sm"
                >
                  <option value="">-- No resume (add later) --</option>
                  {resumes.map((resume) => (
                    <option key={resume._id} value={resume._id}>
                      {resume.versionLabel} {resume.atsScore ? `(ATS: ${resume.atsScore.overallScore})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  💡 Tip: Use a tailored resume for better tracking
                </p>
              </>
            )}
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Application Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg text-sm"
            >
              <option value="saved">Saved (not applied yet)</option>
              <option value="applied">Applied</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'Creating...' : '✓ Create Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function focusColor(key: string): string {
  const colors: Record<string, string> = {
    frontend: '#3b82f6', backend: '#22c55e', devops: '#f97316', ai: '#a855f7', mobile: '#ec4899',
  };
  return colors[key] || '#94a3b8';
}
