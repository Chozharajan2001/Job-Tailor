import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { X } from 'lucide-react';

interface IJob {
  _id: string;
  companyName: string;
  jobTitle: string;
}

interface IResume {
  _id: string;
  versionLabel: string;
  atsScore?: { overallScore: number };
}

interface CreateApplicationModalProps {
  onClose: () => void;
  preselectedJobId?: string;
  preselectedResumeId?: string;
}

export default function CreateApplicationModal({ 
  onClose, 
  preselectedJobId,
  preselectedResumeId 
}: CreateApplicationModalProps) {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<IJob[]>([]);
  const [resumes, setResumes] = useState<IResume[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(preselectedJobId || '');
  const [selectedResumeId, setSelectedResumeId] = useState(preselectedResumeId || '');
  const [status, setStatus] = useState('applied');
  const [loading, setLoading] = useState(true);

  // Fetch jobs and resumes on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [jobsRes, resumesRes] = await Promise.all([
          api.get<{ jobs: IJob[] }>('/jobs?limit=100'),
          api.get<{ resumes: IResume[] }>('/resumes'),
        ]);
        setJobs(jobsRes.data.jobs || []);
        setResumes(resumesRes.data.resumes || []);

        // Try pre-populating with latest reusable resume if none is preselected
        if (!preselectedResumeId) {
          try {
            const reuseRes = await api.get<{ resume: IResume }>('/resumes/reuse');
            if (reuseRes.success && reuseRes.data?.resume) {
              setSelectedResumeId(reuseRes.data.resume._id);
            }
          } catch (err) {
            // No recent resume found, ignore 404
          }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [preselectedResumeId]);

  // ─── Create Application Mutation ────────────────────────────
  const createAppMutation = useMutation({
    mutationFn: (data: { jobId: string; resumeId?: string; status?: string }) =>
      api.post('/applications', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error: any) => {
      if (
        error.response?.status === 409 || 
        error.response?.data?.error?.code === 'APPLICATION_EXISTS'
      ) {
        alert('An application for this job already exists in your tracker.');
      } else {
        alert(error.response?.data?.error?.message || error.message || 'Failed to create application. Please try again.');
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJobId) {
      alert('Please select a job');
      return;
    }
    
    createAppMutation.mutate({
      jobId: selectedJobId,
      resumeId: selectedResumeId || undefined,
      status,
    });
  }

  const selectedJob = jobs.find((j) => j._id === selectedJobId);
  const selectedResume = resumes.find((r) => r._id === selectedResumeId);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Create Application</h2>
          <p className="text-sm text-muted-foreground mt-1">Link a job with a resume to start tracking</p>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Job Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Select Job *</label>
              {jobs.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                  <p className="text-yellow-800">No jobs found. Create a job first!</p>
                  <a href="/jobs" className="text-primary hover:underline mt-2 inline-block">Go to Jobs Page →</a>
                </div>
              ) : (
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg text-sm"
                  required
                >
                  <option value="">-- Select a job --</option>
                  {jobs.map((job) => (
                    <option key={job._id} value={job._id}>
                      {job.jobTitle} at {job.companyName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Resume Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Select Resume (Optional)</label>
              {resumes.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                  <p className="text-yellow-800">No resumes found. You can:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-yellow-700">
                    <li><a href="/tailor" className="text-primary hover:underline">Generate a tailored resume</a></li>
                    <li><a href="/jobs" className="text-primary hover:underline">Upload an existing PDF</a></li>
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

            {/* Summary */}
            {selectedJob && (
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p className="font-medium">{selectedJob.jobTitle}</p>
                <p className="text-muted-foreground">{selectedJob.companyName}</p>
                {selectedResume && (
                  <>
                    <hr className="my-2" />
                    <p className="font-medium">Resume: {selectedResume.versionLabel}</p>
                    {selectedResume.atsScore && (
                      <p className="text-green-600">ATS Score: {selectedResume.atsScore.overallScore}/100</p>
                    )}
                  </>
                )}
              </div>
            )}

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
                disabled={createAppMutation.isPending || !selectedJobId}
                className="px-6 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {createAppMutation.isPending ? 'Creating...' : '✓ Create Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}