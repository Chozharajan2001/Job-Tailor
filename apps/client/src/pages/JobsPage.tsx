import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Upload, FileText, X } from 'lucide-react';
import ResumeUploadModal from '../components/ResumeUploadModal';
import { Link } from 'react-router-dom';

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
  const [showQuickATSModal, setShowQuickATSModal] = useState(false);

  // ─── Search & Filter States ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  // ─── Tab State ────────────────────────────────────────────────
  const [activeSearchTab, setActiveSearchTab] = useState<'tracker' | 'global'>('tracker');

  // ─── Global Search States ────────────────────────────────────
  const [globalSearchInput, setGlobalSearchInput] = useState('');
  const [globalLocationInput, setGlobalLocationInput] = useState('');
  const [globalWorkType, setGlobalWorkType] = useState('all');
  const [globalEmploymentType, setGlobalEmploymentType] = useState('all');
  const [globalSalaryMin, setGlobalSalaryMin] = useState('');
  const [globalSortBy, setGlobalSortBy] = useState('relevance');
  const [globalPage, setGlobalPage] = useState(1);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [submittedLocation, setSubmittedLocation] = useState('');

  const [selectedSearchJob, setSelectedSearchJob] = useState<any | null>(null);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);

  // Ingestion States
  const [ingestUrlInput, setIngestUrlInput] = useState('');

  const quickATSMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await api.post<{
        atsScore: {
          overallScore: number;
          keywordMatchScore: number;
          breakdown: {
            matchedSkills: Array<{ skill: string; presentInResume: boolean }>;
            missingSkills: Array<{ skill: string; required: boolean; suggestion: string }>;
          }
        };
        resumeSource: string;
        resumeVersionLabel: string;
        message: string;
      }>('/resumes/quick-ats-check', { jobId });
      return response.data;
    }
  });

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

  // ─── Global Search Queries ──────────────────────────────────
  const { data: searchRes, isLoading: isSearching } = useQuery({
    queryKey: [
      'global-search',
      submittedQuery,
      submittedLocation,
      globalWorkType,
      globalEmploymentType,
      globalSalaryMin,
      globalSortBy,
      globalPage,
    ],
    queryFn: () =>
      api.get<{ jobs: any[]; pagination: { total: number; page: number; pages: number; limit: number } }>(
        `/search?q=${encodeURIComponent(submittedQuery)}&location=${encodeURIComponent(
          submittedLocation
        )}&workType=${globalWorkType}&employmentType=${globalEmploymentType}&salaryMin=${globalSalaryMin}&sortBy=${globalSortBy}&page=${globalPage}&limit=10`
      ),
    enabled: activeSearchTab === 'global',
  });
  const searchJobsList = searchRes?.data?.jobs || [];
  const searchPagination = searchRes?.data?.pagination;

  const { data: savedSearchesRes, refetch: refetchSavedSearches } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => api.get<{ savedSearches: any[] }>('/search/saved'),
    enabled: activeSearchTab === 'global',
  });
  const savedSearches = savedSearchesRes?.data?.savedSearches || [];

  const { data: alertsRes, refetch: refetchAlerts } = useQuery({
    queryKey: ['job-alerts'],
    queryFn: () => api.get<{ alerts: any[] }>('/search/alerts'),
    enabled: activeSearchTab === 'global',
    refetchInterval: 15000, // Poll alerts every 15s
  });
  const alerts = alertsRes?.data?.alerts || [];

  const markAlertReadMutation = useMutation({
    mutationFn: (alertId: string) => api.patch(`/search/alerts/${alertId}/read`),
    onSuccess: () => {
      refetchAlerts();
    },
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/search/saved/${id}`),
    onSuccess: () => {
      refetchSavedSearches();
    },
  });

  const toggleAlertSubscriptionMutation = useMutation({
    mutationFn: (params: { id: string; inAppEnabled: boolean }) =>
      api.patch(`/search/saved/${params.id}`, {
        alertSubscription: { emailEnabled: false, inAppEnabled: params.inAppEnabled },
      }),
    onSuccess: () => {
      refetchSavedSearches();
    },
  });

  const { data: sourcesRes } = useQuery({
    queryKey: ['search-sources'],
    queryFn: () => api.get<{ sources: any[] }>('/search/sources'),
    enabled: activeSearchTab === 'global',
  });
  const searchSources = sourcesRes?.data?.sources || [];

  // ─── Ingest mutations ───────────────────────────────────────
  const ingestUrlMutation = useMutation({
    mutationFn: (url: string) => api.post('/search/ingest/url', { url }),
    onSuccess: (res: any) => {
      setIngestUrlInput('');
      queryClient.invalidateQueries({ queryKey: ['global-search'] });
      alert(`Job successfully crawled & indexed: "${res.data.job.jobTitle}" at ${res.data.job.companyName}`);
    },
    onError: (err: any) => {
      alert(`Ingestion failed: ${err?.response?.data?.error?.message || err.message}`);
    },
  });

  const saveSearchMutation = useMutation({
    mutationFn: (data: { name: string; query?: string; filters: any }) =>
      api.post('/search/saved', data),
    onSuccess: () => {
      refetchSavedSearches();
      setShowSaveSearchModal(false);
      setSaveSearchName('');
      alert('Search alert saved successfully!');
    },
  });

  const importToTrackerMutation = useMutation({
    mutationFn: (job: any) =>
      api.post<{ job: IJob }>('/jobs', {
        companyName: job.companyName,
        jobTitle: job.jobTitle,
        location: job.location,
        workType: job.workType,
        employmentType: job.employmentType || 'full-time',
        jdRawText: job.description,
        jobLink: job.applyUrl || job.sourceUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      alert('Job successfully imported to your tracker!');
    },
  });

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

  // ─── Filter & Sort Logic ────────────────────────────────────
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = 
      job.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.location && job.location.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesWorkType = workTypeFilter === 'all' || job.workType === workTypeFilter;
    
    return matchesSearch && matchesStatus && matchesWorkType;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.savedAt || 0).getTime() - new Date(b.savedAt || 0).getTime();
    }
    if (sortBy === 'company') {
      return a.companyName.localeCompare(b.companyName);
    }
    if (sortBy === 'title') {
      return a.jobTitle.localeCompare(b.jobTitle);
    }
    return 0;
  });

  const selectedJob = selectedJobId ? jobs.find((j) => j._id === selectedJobId) : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Sliding Tab Selector */}
      <div className="flex border-b border-gray-200 bg-gray-50/50 p-1.5 rounded-xl">
        <button
          onClick={() => setActiveSearchTab('tracker')}
          className={`flex-1 py-2.5 text-center font-bold transition-all rounded-lg cursor-pointer text-sm ${
            activeSearchTab === 'tracker'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🗂️ My Tracker ({jobs.length})
        </button>
        <button
          onClick={() => setActiveSearchTab('global')}
          className={`flex-1 py-2.5 text-center font-bold transition-all rounded-lg cursor-pointer text-sm ${
            activeSearchTab === 'global'
              ? 'bg-white text-primary shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🔍 Global Job Search
        </button>
      </div>

      {activeSearchTab === 'global' ? (
        <div className="space-y-6">
          {/* Global Search Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Global Job Search</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Discover, crawl, and index job postings across public careers web pages.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: URL Crawling & Saved Searches */}
            <div className="space-y-4">
              {/* Job Match Alerts (Notification Inbox) */}
              <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="font-semibold text-sm flex justify-between items-center">
                  <span className="flex items-center gap-1">🔔 Match Alerts</span>
                  {alerts.length > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
                      {alerts.length} new
                    </span>
                  )}
                </h3>
                {alerts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No new job matches.</p>
                ) : (
                  <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                    {alerts.map((a: any) => (
                      <div
                        key={a._id}
                        className="p-2.5 border rounded-lg hover:border-gray-300 transition-colors text-xs space-y-2 bg-red-50/20"
                      >
                        <div>
                          <div className="font-bold text-gray-900 truncate">{a.canonicalJobId?.jobTitle}</div>
                          <div className="text-[10px] text-primary font-semibold">{a.canonicalJobId?.companyName}</div>
                          <div className="text-[9px] text-muted-foreground mt-0.5">{a.canonicalJobId?.location} • {a.canonicalJobId?.workType}</div>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t">
                          <button
                            onClick={() => setSelectedSearchJob(a.canonicalJobId)}
                            className="text-[9px] text-gray-600 hover:text-gray-900 font-semibold cursor-pointer"
                          >
                            View
                          </button>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                markAlertReadMutation.mutate(a._id);
                              }}
                              className="text-[9px] text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              Dismiss
                            </button>
                            <button
                              onClick={() => {
                                importToTrackerMutation.mutate(a.canonicalJobId);
                                markAlertReadMutation.mutate(a._id);
                              }}
                              className="text-[9px] text-green-700 hover:text-green-900 font-bold cursor-pointer"
                            >
                              Import
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Crawler Form */}
              <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="font-semibold text-sm">🌐 Index Job via URL</h3>
                <p className="text-xs text-muted-foreground">Paste a link to any public company job page to crawl, extract meta JSON-LD details, and register.</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="https://lever.co/company/job-id..."
                    value={ingestUrlInput}
                    onChange={(e) => setIngestUrlInput(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    disabled={ingestUrlMutation.isPending || !ingestUrlInput.trim()}
                    onClick={() => ingestUrlMutation.mutate(ingestUrlInput)}
                    className="w-full py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer block transition-colors text-center"
                  >
                    {ingestUrlMutation.isPending ? 'Crawling & Parsing...' : 'Index Job URL'}
                  </button>
                </div>
              </div>

              {/* Saved Alert criteria */}
              <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="font-semibold text-sm">💾 Saved Search Alerts</h3>
                {savedSearches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No saved search alerts found.</p>
                ) : (
                  <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                    {savedSearches.map((s) => (
                      <div
                        key={s._id}
                        className="p-2.5 border rounded-lg hover:border-gray-300 transition-colors text-xs space-y-2 bg-white"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-gray-800">{s.name}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {s.query && `"${s.query}"`} {s.filters?.location && `• ${s.filters.location}`} {s.filters?.workType && `• ${s.filters.workType}`}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteSavedSearchMutation.mutate(s._id)}
                            className="text-gray-400 hover:text-red-500 font-bold leading-none text-sm p-1 cursor-pointer"
                            title="Delete alert"
                          >
                            &times;
                          </button>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t">
                          <button
                            onClick={() => {
                              setGlobalSearchInput(s.query || '');
                              setGlobalLocationInput(s.filters?.location || '');
                              setGlobalWorkType(s.filters?.workType || 'all');
                              setSubmittedQuery(s.query || '');
                              setSubmittedLocation(s.filters?.location || '');
                              setGlobalPage(1);
                            }}
                            className="text-[9px] text-primary font-bold hover:underline cursor-pointer"
                          >
                            Run Search
                          </button>
                          <label className="flex items-center gap-1 text-[9px] text-gray-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={s.alertSubscription?.inAppEnabled}
                              onChange={(e) => {
                                toggleAlertSubscriptionMutation.mutate({
                                  id: s._id,
                                  inAppEnabled: e.target.checked,
                                });
                              }}
                              className="w-2.5 h-2.5 rounded text-primary focus:ring-primary cursor-pointer"
                            />
                            <span>Enable Alerts</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Keyword Search & Filter results */}
            <div className="lg:col-span-2 space-y-4">
              {/* Query filters */}
              <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Search by keywords, title, skills..."
                    value={globalSearchInput}
                    onChange={(e) => setGlobalSearchInput(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="text"
                    placeholder="Location"
                    value={globalLocationInput}
                    onChange={(e) => setGlobalLocationInput(e.target.value)}
                    className="w-full md:w-48 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => {
                      setSubmittedQuery(globalSearchInput);
                      setSubmittedLocation(globalLocationInput);
                      setGlobalPage(1);
                    }}
                    className="px-5 py-2 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 text-sm cursor-pointer"
                  >
                    Search
                  </button>
                </div>
                <div className="flex justify-between items-center pt-2 border-t text-xs">
                  <div className="flex gap-3">
                     <label className="flex items-center gap-1">
                       <span>Work Type:</span>
                       <select
                         value={globalWorkType}
                         onChange={(e) => setGlobalWorkType(e.target.value)}
                         className="border rounded px-1.5 py-0.5 bg-white cursor-pointer text-[11px]"
                       >
                         <option value="all">All</option>
                         <option value="remote">Remote</option>
                         <option value="hybrid">Hybrid</option>
                         <option value="onsite">On-site</option>
                       </select>
                     </label>
                     <label className="flex items-center gap-1">
                       <span>Job Type:</span>
                       <select
                         value={globalEmploymentType}
                         onChange={(e) => setGlobalEmploymentType(e.target.value)}
                         className="border rounded px-1.5 py-0.5 bg-white cursor-pointer text-[11px]"
                       >
                         <option value="all">All Types</option>
                         <option value="full-time">Full-time</option>
                         <option value="part-time">Part-time</option>
                         <option value="contract">Contract</option>
                         <option value="internship">Internship</option>
                       </select>
                     </label>
                     <label className="flex items-center gap-1">
                       <span>Min Salary ($):</span>
                       <input
                         type="number"
                         placeholder="Min pay"
                         value={globalSalaryMin}
                         onChange={(e) => setGlobalSalaryMin(e.target.value)}
                         className="border rounded px-1.5 py-0.5 bg-white text-[11px] w-20 focus:outline-none"
                       />
                     </label>
                     <label className="flex items-center gap-1">
                       <span>Sort By:</span>
                       <select
                         value={globalSortBy}
                         onChange={(e) => setGlobalSortBy(e.target.value)}
                         className="border rounded px-1.5 py-0.5 bg-white cursor-pointer text-[11px]"
                       >
                         <option value="relevance">Relevance</option>
                         <option value="date">Date Posted</option>
                       </select>
                     </label>
                   </div>
                  {(submittedQuery || submittedLocation) && (
                    <button
                      onClick={() => setShowSaveSearchModal(true)}
                      className="text-primary font-semibold hover:underline cursor-pointer"
                    >
                      💾 Save Search Alert
                    </button>
                  )}
                </div>
              </div>

              {/* Crawled Results Feed */}
              <div className="space-y-3">
                {isSearching ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-2 text-muted-foreground text-sm">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                    <span>Searching canonical listings...</span>
                  </div>
                ) : !submittedQuery && !submittedLocation ? (
                  <div className="text-center py-16 border rounded-xl bg-gray-50/50 space-y-2">
                    <span className="text-2xl">🔎</span>
                    <p className="text-sm font-medium text-gray-500">Run a search above or paste a job link in the left panel to crawl and query jobs.</p>
                  </div>
                ) : searchJobsList.length === 0 ? (
                  <div className="text-center py-16 border border-dashed rounded-xl bg-gray-50/50">
                    <p className="text-sm text-muted-foreground">No matching postings in our canonical database.</p>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground px-1">
                      Found {searchPagination?.total || 0} matching jobs
                    </div>
                    {searchJobsList.map((job) => (
                      <div key={job._id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-gray-900">{job.jobTitle}</h4>
                              {job.relevanceScore !== undefined && job.relevanceScore > 0 && (
                                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-1.5 py-0.5 rounded-full font-bold">
                                  {Math.min(100, Math.round((job.relevanceScore / 130) * 100))}% Match
                                </span>
                              )}
                              {job.skillsMatchedCount > 0 && (
                                <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200/60 px-1.5 py-0.5 rounded-full font-bold">
                                  {job.skillsMatchedCount} skills matched
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-primary mt-0.5">{job.companyName}</p>
                          </div>
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium capitalize shrink-0">
                            {job.workType} • {job.employmentType || 'full-time'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{job.description}</p>
                        <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1.5 border-t">
                          <div>
                            <span>Source: <strong className="text-gray-600">{job.sourceName}</strong></span>
                            <span className="mx-2">•</span>
                            <span>Seen {new Date(job.firstSeenAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedSearchJob(job)}
                              className="px-2.5 py-1 border rounded text-gray-600 hover:bg-gray-50 cursor-pointer"
                            >
                              View Details
                            </button>
                            <button
                              disabled={importToTrackerMutation.isPending}
                              onClick={() => importToTrackerMutation.mutate(job)}
                              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold cursor-pointer"
                            >
                              Import to Tracker
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Pagination */}
                    {searchPagination && searchPagination.pages > 1 && (
                      <div className="flex justify-center gap-1.5 pt-2">
                        {Array.from({ length: searchPagination.pages }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setGlobalPage(i + 1)}
                            className={`px-2.5 py-1 border rounded text-xs font-semibold cursor-pointer ${
                              globalPage === i + 1 ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-gray-50 text-gray-600'
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Search & Filters Controls */}
          <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search by title, company, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 text-sm font-bold"
                  >
                    &times;
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="saved">Saved</option>
                  <option value="applied">Applied</option>
                  <option value="screening">Screening</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select
                  value={workTypeFilter}
                  onChange={(e) => setWorkTypeFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="all">All Work Types</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">Onsite</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="company">Company (A-Z)</option>
                  <option value="title">Title (A-Z)</option>
                </select>
              </div>
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
              ) : sortedJobs.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg bg-gray-50/50">
                  <p className="text-muted-foreground text-sm">No matching jobs found</p>
                  <button 
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); setWorkTypeFilter('all'); }} 
                    className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                sortedJobs.map((job) => (
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
                  onQuickATSCheck={() => {
                    setShowQuickATSModal(true);
                    quickATSMutation.mutate(selectedJob._id);
                  }}
                />
              ) : (
                <div className="border rounded-xl h-[500px] flex items-center justify-center text-muted-foreground">
                  <p>Select a job to view details</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Canonical Job Details modal */}
      {selectedSearchJob && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSearchJob(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{selectedSearchJob.jobTitle}</h3>
                <p className="text-sm font-semibold text-primary mt-0.5">{selectedSearchJob.companyName}</p>
              </div>
              <button onClick={() => setSelectedSearchJob(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">Location: {selectedSearchJob.location}</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">Work Type: {selectedSearchJob.workType}</span>
                {selectedSearchJob.employmentType && <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700">Type: {selectedSearchJob.employmentType}</span>}
                {selectedSearchJob.sourceUrl && <a href={selectedSearchJob.sourceUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded bg-green-50 text-green-700 hover:underline">Source Link ↗</a>}
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Job Description</h4>
                <div className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-4 rounded-lg border max-h-[50vh] overflow-y-auto">
                  {selectedSearchJob.description}
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
              <button onClick={() => setSelectedSearchJob(null)} className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer bg-white">
                Close
              </button>
              <button
                disabled={importToTrackerMutation.isPending}
                onClick={() => {
                  importToTrackerMutation.mutate(selectedSearchJob);
                  setSelectedSearchJob(null);
                }}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                {importToTrackerMutation.isPending ? 'Importing...' : 'Import to Tracker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveSearchModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveSearchModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-sm">Save Search Alert</h3>
              <button onClick={() => setShowSaveSearchModal(false)} className="text-gray-400 hover:text-gray-600 text-sm font-bold leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-xs font-medium space-y-1">
                <span>Alert Name (e.g. "Senior React SF")</span>
                <input
                  type="text"
                  placeholder="My search alert..."
                  value={saveSearchName}
                  onChange={(e) => setSaveSearchName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 text-xs">
                <button onClick={() => setShowSaveSearchModal(false)} className="px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 cursor-pointer bg-white">
                  Cancel
                </button>
                <button
                  disabled={saveSearchMutation.isPending || !saveSearchName.trim()}
                  onClick={() =>
                    saveSearchMutation.mutate({
                      name: saveSearchName,
                      query: submittedQuery,
                      filters: { location: submittedLocation, workType: globalWorkType },
                    })
                  }
                  className="px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer"
                >
                  Save Alert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
    {/* Quick ATS Preview Modal */}
      {showQuickATSModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowQuickATSModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold flex items-center gap-2">
                🔍 Quick ATS Match Check
              </h2>
              <button onClick={() => setShowQuickATSModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">&times;</button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {quickATSMutation.isPending ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
                  <p className="text-sm text-muted-foreground">Running semantic matcher and check gaps...</p>
                </div>
              ) : quickATSMutation.isError ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm space-y-3">
                  <p className="font-semibold">Match Check Failed</p>
                  <p className="text-xs text-red-700">
                    {(quickATSMutation.error as any)?.response?.data?.error?.message || 
                     (quickATSMutation.error as any)?.message || 
                     "Make sure you have uploaded a resume or completed your profile."}
                  </p>
                  <div className="pt-2">
                    <Link 
                      to="/profile" 
                      onClick={() => setShowQuickATSModal(false)}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors inline-block"
                    >
                      Go to Profile Setup →
                    </Link>
                  </div>
                </div>
              ) : quickATSMutation.data ? (
                <div className="space-y-4">
                  {/* Score Gauge */}
                  <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-xl border">
                    <div className="relative w-20 h-20 rounded-full flex items-center justify-center bg-white shadow-sm border border-gray-100 shrink-0">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" 
                          stroke={quickATSMutation.data.atsScore.overallScore >= 75 ? '#22c55e' : quickATSMutation.data.atsScore.overallScore >= 50 ? '#f59e0b' : '#ef4444'} 
                          strokeWidth="3" strokeDasharray={`${quickATSMutation.data.atsScore.overallScore}, 100`} strokeLinecap="round" />
                      </svg>
                      <span className="text-xl font-black">{quickATSMutation.data.atsScore.overallScore}</span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <h4 className="font-semibold text-sm text-gray-900">Score Check Completed</h4>
                      <p className="text-xs text-muted-foreground">{quickATSMutation.data.message}</p>
                      <p className="text-xs font-semibold text-primary mt-1">Resume: {quickATSMutation.data.resumeVersionLabel}</p>
                    </div>
                  </div>
 
                  {/* Skills lists */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Skill Gap Analysis</h4>
                    
                    {quickATSMutation.data.atsScore.breakdown.missingSkills.length > 0 ? (
                      <div className="space-y-1.5">
                        {quickATSMutation.data.atsScore.breakdown.missingSkills.map((ms: any) => (
                          <div key={ms.skill} className="flex gap-2 items-start text-xs bg-red-50/50 p-2 border border-red-100/50 rounded-lg">
                            <span className="font-semibold text-red-700">{ms.skill}</span>
                            {ms.required && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase shrink-0">Required</span>}
                            <span className="text-gray-500 flex-1">{ms.suggestion}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-green-700 bg-green-50 p-3 rounded-lg border border-green-200">
                        🎉 Zero missing skills! Your resume matches the job requirements perfectly.
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="pt-3 flex justify-between gap-3 border-t">
                    <button onClick={() => setShowQuickATSModal(false)} className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
                      Close
                    </button>
                    <Link to="/tailor" onClick={() => setShowQuickATSModal(false)} className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-lg hover:opacity-95 shadow-sm inline-flex items-center gap-1">
                      🪄 Go Generate Tailored Version
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
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

function JobDetailPanel({ job, isParsing, onParse, onCreateApplication, onQuickATSCheck }: { 
  job: IJob; 
  isParsing: boolean; 
  onParse: () => void;
  onCreateApplication: () => void;
  onQuickATSCheck: () => void;
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
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onQuickATSCheck}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
          >
            🔍 Check ATS Score
          </button>
          <button
            onClick={onCreateApplication}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
          >
            📝 Create Application
          </button>
          <Link to="/tailor" className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors">
            Tailor Resume →
          </Link>
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
