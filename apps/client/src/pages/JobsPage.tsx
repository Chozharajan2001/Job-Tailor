import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Upload, FileText, X, Check, Plus } from 'lucide-react';
import ResumeUploadModal from '../components/ResumeUploadModal';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';

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
  attachedResumeId?: string;
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
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);

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
  const handleViewSearchJob = (job: any) => {
    if (!job) return;
    setSelectedSearchJob(job);
    api.post('/search/analytics/click', { canonicalJobId: job._id }).catch((err) => {
      console.error('Failed to log search query click:', err);
    });
  };
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
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || error.message || 'Quick ATS check failed. Please ensure you have a resume set up.');
    },
  });

  const attachResumeMutation = useMutation({
    mutationFn: async ({ jobId, resumeId }: { jobId: string; resumeId: string }) => {
      const response = await api.patch<{ job: IJob }>(`/jobs/${jobId}/attach-resume`, { resumeId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['global-search'] });
      toast.success('Resume attached to job!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || error.message || 'Failed to attach resume.');
    },
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
  const { data: searchRes, isLoading: isSearchPending, refetch: refetchSearch } = useQuery({
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
  const isSearching = isSearchPending;
  const searchPagination = searchRes?.data?.pagination;
  const searchJobsList = searchRes?.data?.jobs || [];

  // ─── Curated Feed & Watches states ────────────────────────────
  const [globalSubTab, setGlobalSubTab] = useState<'search' | 'feed' | 'quality'>('search');
  const [newWatchValue, setNewWatchValue] = useState('');
  const [newWatchType, setNewWatchType] = useState<'company' | 'title'>('company');

  // Watches query
  const { data: watchesRes, refetch: refetchWatches } = useQuery({
    queryKey: ['watches'],
    queryFn: () => api.get<{ watches: any[] }>('/search/watches'),
    enabled: activeSearchTab === 'global',
  });
  const watches = watchesRes?.data?.watches || [];

  // Feed query
  const [feedPage, setFeedPage] = useState(1);
  const { data: feedRes, refetch: refetchFeed, isPending: isFeedPending } = useQuery({
    queryKey: ['job-feed', feedPage],
    queryFn: () => api.get<{ feed: any[]; pagination: any }>(`/search/feed?page=${feedPage}&limit=15`),
    enabled: activeSearchTab === 'global' && globalSubTab === 'feed',
  });
  const feedJobs = feedRes?.data?.feed || [];
  const feedPagination = feedRes?.data?.pagination;

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

  // Quality Dashboard Query
  const { data: analyticsRes, refetch: refetchAnalytics } = useQuery({
    queryKey: ['search-analytics-dashboard'],
    queryFn: () => api.get<any>('/search/analytics/dashboard'),
    enabled: activeSearchTab === 'global' && globalSubTab === 'quality',
  });
  const analyticsData = analyticsRes?.data?.data;

  const markAlertReadMutation = useMutation({
    mutationFn: (alertId: string) => api.patch(`/search/alerts/${alertId}/read`),
    onSuccess: () => {
      refetchAlerts();
    },
  });

  const dismissAllAlertsMutation = useMutation({
    mutationFn: () => api.patch('/search/alerts/read-all'),
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

  // Watch Mutations
  const createWatchMutation = useMutation({
    mutationFn: (params: { type: 'company' | 'title'; value: string }) =>
      api.post('/search/watches', params),
    onSuccess: () => {
      refetchWatches();
      if (globalSubTab === 'feed') refetchFeed();
      setNewWatchValue('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || 'Failed to add watch keyword.');
    },
  });

  const toggleWatchMutation = useMutation({
    mutationFn: (params: { id: string; isEnabled: boolean }) =>
      api.patch(`/search/watches/${params.id}`, { isEnabled: params.isEnabled }),
    onSuccess: () => {
      refetchWatches();
      if (globalSubTab === 'feed') refetchFeed();
    },
  });

  const deleteWatchMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/search/watches/${id}`),
    onSuccess: () => {
      refetchWatches();
      if (globalSubTab === 'feed') refetchFeed();
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: (params: { canonicalJobId: string; interactionType: 'flag_expired' | 'flag_spam'; feedbackComment?: string }) =>
      api.post('/search/feedback', params),
    onSuccess: () => {
      alert('Feedback submitted. Thank you for keeping search quality high!');
      setSelectedSearchJob(null);
      refetchSearch();
      if (globalSubTab === 'feed') refetchFeed();
      if (globalSubTab === 'quality') refetchAnalytics();
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || 'Failed to submit feedback.');
    },
  });

  const runCleanupMutation = useMutation({
    mutationFn: () => api.post('/search/cleanup', {}),
    onSuccess: () => {
      alert('Verification scanner completed successfully!');
      refetchSearch();
      if (globalSubTab === 'feed') refetchFeed();
      if (globalSubTab === 'quality') refetchAnalytics();
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || 'Failed to run verification scanner.');
    },
  });

  const updateTrustMutation = useMutation({
    mutationFn: (params: { id: string; trustScore: number }) =>
      api.post(`/search/sources/${params.id}/trust`, { trustScore: params.trustScore }),
    onSuccess: () => {
      alert('Source trust score updated!');
      refetchAnalytics();
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || 'Failed to update trust score.');
    },
  });

  const createSourceMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      sourceType: 'manual_paste' | 'public_job_page';
      baseUrl: string;
      crawlFrequency: number;
      extractionStrategy: 'html_metadata' | 'json_ld' | 'manual_input';
      trustScore?: number;
    }) => {
      const response = await api.post('/search/sources', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-sources'] });
      refetchAnalytics();
      setShowAddSourceModal(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || 'Failed to register source');
    }
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
      toast.success('Job added successfully!');
      setShowModal(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || error.message || 'Failed to create job. Please try again.');
    },
  });

  // ─── Parse JD Mutation ───────────────────────────────────────
  const parseJDMutation = useMutation({
    mutationFn: (jobId: string) => api.post<IParsedJD>(`/jobs/${jobId}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('JD parsed successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || error.message || 'Failed to parse JD. Please try again.');
    },
  });

  // ─── Create Application Mutation ────────────────────────────
  const createAppMutation = useMutation({
    mutationFn: (data: { jobId: string; resumeId?: string; status?: string }) =>
      api.post('/applications', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Application created!');
      setShowApplicationModal(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || error.message || 'Failed to create application.');
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
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm flex items-center gap-1">🔔 Match Alerts</h3>
                  {alerts.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => dismissAllAlertsMutation.mutate()}
                        disabled={dismissAllAlertsMutation.isPending}
                        className="text-[10px] text-primary hover:underline font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Dismiss All
                      </button>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">
                        {alerts.length} new
                      </span>
                    </div>
                  )}
                </div>
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
                            onClick={() => handleViewSearchJob(a.canonicalJobId)}
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

              {/* Keyword Watches Panel */}
              <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-1">👀 Keyword Watches</h3>
                <p className="text-xs text-muted-foreground">Monitor specific companies or titles to alert you when matching new jobs are indexed.</p>
                
                {/* Watch Form */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Google, SRE..."
                    value={newWatchValue}
                    onChange={(e) => setNewWatchValue(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <select
                    value={newWatchType}
                    onChange={(e) => setNewWatchType(e.target.value as any)}
                    className="border rounded-lg px-1.5 py-1.5 bg-white text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="company">Company</option>
                    <option value="title">Title</option>
                  </select>
                  <button
                    disabled={createWatchMutation.isPending || !newWatchValue.trim()}
                    onClick={() => createWatchMutation.mutate({ type: newWatchType, value: newWatchValue })}
                    className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {/* Watch list */}
                {watches.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground pt-1">No watches configured yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[25vh] overflow-y-auto pr-1 pt-1 border-t mt-2">
                    {watches.map((w) => (
                      <div key={w._id} className="flex justify-between items-center p-2 border rounded-lg text-xs bg-gray-50/40">
                        <div className="truncate pr-2">
                          <span className="font-semibold text-gray-800">{w.value}</span>
                          <span className="ml-1.5 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.2 rounded capitalize border">
                            {w.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="checkbox"
                            checked={w.isEnabled}
                            onChange={(e) => toggleWatchMutation.mutate({ id: w._id, isEnabled: e.target.checked })}
                            className="w-3 h-3 rounded text-primary focus:ring-primary cursor-pointer"
                          />
                          <button
                            onClick={() => deleteWatchMutation.mutate(w._id)}
                            className="text-gray-400 hover:text-red-500 text-xs font-bold px-1 cursor-pointer"
                            title="Delete watch"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Keyword Search & Filter results */}
            <div className="lg:col-span-2 space-y-4">
              {/* Discover Feed vs Search Index Sub-tabs */}
              <div className="flex border-b border-gray-150 bg-gray-100/60 p-1 rounded-lg">
                <button
                  onClick={() => setGlobalSubTab('search')}
                  className={`flex-1 py-1.5 text-center font-semibold transition-all rounded-md cursor-pointer text-xs ${
                    globalSubTab === 'search'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🔍 Search Index
                </button>
                <button
                  onClick={() => setGlobalSubTab('feed')}
                  className={`flex-1 py-1.5 text-center font-semibold transition-all rounded-md cursor-pointer text-xs ${
                    globalSubTab === 'feed'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📰 Curated Feed
                </button>
                <button
                  onClick={() => setGlobalSubTab('quality')}
                  className={`flex-1 py-1.5 text-center font-semibold transition-all rounded-md cursor-pointer text-xs ${
                    globalSubTab === 'quality'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📊 Quality Dashboard
                </button>
              </div>

              {globalSubTab === 'search' && (
                <>
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
                                  onClick={() => handleViewSearchJob(job)}
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
                </>
              )}

              {globalSubTab === 'feed' && (
                /* Curated Discover Feed view */
                <div className="space-y-3">
                  <div className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
                    <h3 className="font-semibold text-sm">📰 Personalized Job Discovery Feed</h3>
                    <p className="text-xs text-muted-foreground">
                      This feed is automatically compiled from your master profile skills and active company/title watches. It excludes any jobs you have already imported to your tracker.
                    </p>
                  </div>

                  {isFeedPending ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-2 text-muted-foreground text-sm">
                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                      <span>Compiling feed...</span>
                    </div>
                  ) : feedJobs.length === 0 ? (
                    <div className="text-center py-16 border border-dashed rounded-xl bg-gray-50/50 space-y-2">
                      <span className="text-2xl">📭</span>
                      <p className="text-sm font-medium text-gray-500">Your feed is empty.</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Add skills to your master profile or configure title/company keywords in the "Keyword Watches" panel to populate your feed!
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-muted-foreground px-1">
                        Curated {feedPagination?.total || 0} matching jobs
                      </div>
                      {feedJobs.map((job: any) => (
                        <div key={job._id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-sm text-gray-900">{job.jobTitle}</h4>
                                {job.isWatchMatch && (
                                  <span className="text-[9px] bg-red-50 text-red-700 border border-red-200/60 px-1.5 py-0.5 rounded-full font-bold">
                                    🎯 Watched
                                  </span>
                                )}
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
                                onClick={() => handleViewSearchJob(job)}
                                className="px-2.5 py-1 border rounded text-gray-600 hover:bg-gray-50 cursor-pointer"
                              >
                                View Details
                              </button>
                              <button
                                disabled={importToTrackerMutation.isPending}
                                onClick={() => {
                                  importToTrackerMutation.mutate(job);
                                  // Mark related alert as read if it is in alerts list
                                  const matchingAlert = alerts.find((a: any) => a.canonicalJobId?._id === job._id);
                                  if (matchingAlert) {
                                    markAlertReadMutation.mutate(matchingAlert._id);
                                  }
                                }}
                                className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold cursor-pointer"
                              >
                                Import to Tracker
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
    
                      {/* Feed Pagination */}
                      {feedPagination && feedPagination.pages > 1 && (
                        <div className="flex justify-center gap-1.5 pt-2">
                          {Array.from({ length: feedPagination.pages }).map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setFeedPage(i + 1)}
                              className={`px-2.5 py-1 border rounded text-xs font-semibold cursor-pointer ${
                                feedPage === i + 1 ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-gray-50 text-gray-600'
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
              )}

              {globalSubTab === 'quality' && (
                <div className="space-y-4">
                  {/* Quality Dashboard Header */}
                  <div className="bg-white border rounded-xl p-5 shadow-sm flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-base text-gray-900">📊 Search Quality & Ingestion Dashboard</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Monitor source trust scores, URL verification states, and user search engagement analytics.
                      </p>
                    </div>
                    <button
                      disabled={runCleanupMutation.isPending}
                      onClick={() => runCleanupMutation.mutate()}
                      className="px-3.5 py-2 bg-primary text-white hover:bg-primary-dark text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      🔄 {runCleanupMutation.isPending ? 'Verifying Links...' : 'Verify Links Now'}
                    </button>
                  </div>

                  {!analyticsData ? (
                    <div className="py-12 bg-white border rounded-xl shadow-sm flex flex-col items-center justify-center space-y-2 text-muted-foreground text-sm">
                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                      <span>Loading analytics metrics...</span>
                    </div>
                  ) : (
                    <>
                      {/* Metrics Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white border rounded-xl p-4 shadow-sm">
                          <span className="text-xs text-muted-foreground font-semibold">Total Queries Logged</span>
                          <div className="text-2xl font-bold text-gray-900 mt-1">{analyticsData.totalQueries}</div>
                        </div>
                        <div className="bg-white border rounded-xl p-4 shadow-sm">
                          <span className="text-xs text-muted-foreground font-semibold">Click-Through Rate (CTR)</span>
                          <div className="text-2xl font-bold text-gray-900 mt-1">{(analyticsData.ctr * 100).toFixed(1)}%</div>
                          <span className="text-[10px] text-muted-foreground">({analyticsData.clicks} clicks)</span>
                        </div>
                        <div className="bg-white border rounded-xl p-4 shadow-sm">
                          <span className="text-xs text-muted-foreground font-semibold">Import Conversion Rate</span>
                          <div className="text-2xl font-bold text-gray-900 mt-1">{(analyticsData.importRate * 100).toFixed(1)}%</div>
                          <span className="text-[10px] text-muted-foreground">({analyticsData.imports} imports)</span>
                        </div>
                      </div>

                      {/* State Breakdown & Top Queries */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Verification States breakdown */}
                        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
                          <h4 className="font-bold text-sm text-gray-900 border-b pb-2">📋 Ingestion Verification Breakdown</h4>
                          <div className="space-y-3 text-xs">
                            <div>
                              <div className="flex justify-between font-semibold mb-1">
                                <span className="text-emerald-700">Verified Active Links</span>
                                <span>{analyticsData.verificationStates?.verified || 0}</span>
                              </div>
                              <div className="w-full bg-gray-150 h-2 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(analyticsData.verificationStates?.verified / (Math.max(1, analyticsData.verificationStates?.verified + analyticsData.verificationStates?.unverified + analyticsData.verificationStates?.failed + analyticsData.verificationStates?.suspicious))) * 100}%` }}></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between font-semibold mb-1">
                                <span className="text-gray-600">Unverified / New Ingestion</span>
                                <span>{analyticsData.verificationStates?.unverified || 0}</span>
                              </div>
                              <div className="w-full bg-gray-150 h-2 rounded-full overflow-hidden">
                                <div className="bg-gray-400 h-full rounded-full" style={{ width: `${(analyticsData.verificationStates?.unverified / (Math.max(1, analyticsData.verificationStates?.verified + analyticsData.verificationStates?.unverified + analyticsData.verificationStates?.failed + analyticsData.verificationStates?.suspicious))) * 100}%` }}></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between font-semibold mb-1">
                                <span className="text-red-700">Failed / Dead Links (404/Redirect)</span>
                                <span>{analyticsData.verificationStates?.failed || 0}</span>
                              </div>
                              <div className="w-full bg-gray-150 h-2 rounded-full overflow-hidden">
                                <div className="bg-red-500 h-full rounded-full" style={{ width: `${(analyticsData.verificationStates?.failed / (Math.max(1, analyticsData.verificationStates?.verified + analyticsData.verificationStates?.unverified + analyticsData.verificationStates?.failed + analyticsData.verificationStates?.suspicious))) * 100}%` }}></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between font-semibold mb-1">
                                <span className="text-amber-700">Suspicious / User Spam Reports</span>
                                <span>{analyticsData.verificationStates?.suspicious || 0}</span>
                              </div>
                              <div className="w-full bg-gray-150 h-2 rounded-full overflow-hidden">
                                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(analyticsData.verificationStates?.suspicious / (Math.max(1, analyticsData.verificationStates?.verified + analyticsData.verificationStates?.unverified + analyticsData.verificationStates?.failed + analyticsData.verificationStates?.suspicious))) * 100}%` }}></div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Top search terms */}
                        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
                          <h4 className="font-bold text-sm text-gray-900 border-b pb-2">🔥 Top Search Queries</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-gray-700">
                              <thead>
                                <tr className="border-b text-gray-400 font-semibold">
                                  <th className="py-2">Search Query</th>
                                  <th className="py-2 text-right">Query Frequency</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analyticsData.topQueries?.length === 0 ? (
                                  <tr>
                                    <td colSpan={2} className="py-4 text-center text-muted-foreground">No search query logs recorded yet.</td>
                                  </tr>
                                ) : (
                                  analyticsData.topQueries?.map((q: any, i: number) => (
                                    <tr key={i} className="border-b hover:bg-gray-50/50">
                                      <td className="py-2 font-mono text-gray-900">"{q.query}"</td>
                                      <td className="py-2 text-right font-bold text-primary">{q.count}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Source Registries Health Audit */}
                      <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b pb-2">
                          <h4 className="font-bold text-sm text-gray-900">🔌 Job Source Health & Trust Matrix</h4>
                          <button
                            onClick={() => setShowAddSourceModal(true)}
                            className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors"
                          >
                            + Register Source
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-gray-700 min-w-[600px]">
                            <thead>
                              <tr className="border-b text-gray-400 font-semibold bg-gray-50/30">
                                <th className="py-3 px-3">Source Name</th>
                                <th className="py-3 px-3">Type</th>
                                <th className="py-3 px-3">Dynamic Trust Score</th>
                                <th className="py-3 px-3">Verified / Failed / Suspicious</th>
                                <th className="py-3 px-3 text-right">Manual Trust Override</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analyticsData.sourceHealth?.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="py-4 text-center text-muted-foreground">No ingestion sources registered.</td>
                                </tr>
                              ) : (
                                analyticsData.sourceHealth?.map((src: any) => (
                                  <tr key={src._id} className="border-b hover:bg-gray-50/50">
                                    <td className="py-3 px-3">
                                      <div className="font-bold text-gray-900">{src.name}</div>
                                      <div className="text-[10px] text-muted-foreground font-mono">{src.baseUrl}</div>
                                    </td>
                                    <td className="py-3 px-3">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${src.sourceType === 'manual_paste' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                                        {src.sourceType === 'manual_paste' ? 'Paste' : 'Crawler'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-1.5">
                                        <div className="font-mono font-bold text-sm">{src.trustScore.toFixed(2)}</div>
                                        <div className="w-12 bg-gray-150 h-1.5 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${src.trustScore >= 0.7 ? 'bg-emerald-500' : src.trustScore >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${src.trustScore * 100}%` }}></div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-emerald-700 font-bold" title="Verified">{src.states?.verified || 0}V</span>
                                        <span className="text-gray-400 font-medium">/</span>
                                        <span className="text-red-700 font-bold" title="Failed">{src.states?.failed || 0}F</span>
                                        <span className="text-gray-400 font-medium">/</span>
                                        <span className="text-amber-700 font-bold" title="Suspicious">{src.states?.suspicious || 0}S</span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 text-right">
                                      <div className="inline-flex items-center gap-1">
                                        <input
                                          type="number"
                                          step="0.05"
                                          min="0"
                                          max="1"
                                          placeholder={src.trustScore.toFixed(2)}
                                          defaultValue={src.trustScore.toFixed(2)}
                                          onBlur={(e) => {
                                            const score = parseFloat(e.target.value);
                                            if (!isNaN(score) && score >= 0 && score <= 1 && Math.abs(score - src.trustScore) > 0.001) {
                                              updateTrustMutation.mutate({ id: src._id, trustScore: score });
                                            }
                                          }}
                                          className="w-14 px-1.5 py-1 border rounded text-right text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
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
                  resumes={resumes}
                  onAttachResume={(resumeId) => attachResumeMutation.mutate({ jobId: selectedJob._id, resumeId })}
                  isAttaching={attachResumeMutation.isPending}
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
            <div className="p-4 border-t flex justify-between items-center bg-gray-50">
              <div className="flex gap-2">
                <button
                  disabled={submitFeedbackMutation.isPending}
                  onClick={() => submitFeedbackMutation.mutate({ canonicalJobId: selectedSearchJob._id, interactionType: 'flag_expired' })}
                  className="px-2.5 py-1.5 border border-amber-200 hover:bg-amber-50 text-amber-700 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer bg-white"
                >
                  ⚠️ Report Dead Link
                </button>
                <button
                  disabled={submitFeedbackMutation.isPending}
                  onClick={() => submitFeedbackMutation.mutate({ canonicalJobId: selectedSearchJob._id, interactionType: 'flag_spam' })}
                  className="px-2.5 py-1.5 border border-red-200 hover:bg-red-50 text-red-700 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer bg-white"
                >
                  🚫 Report Spam
                </button>
              </div>
              <div className="flex gap-3">
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

      {/* Register Source Modal */}
      {showAddSourceModal && (
        <RegisterSourceModal
          onClose={() => setShowAddSourceModal(false)}
          onSubmit={(data) => createSourceMutation.mutate(data)}
          isLoading={createSourceMutation.isPending}
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

function JobDetailPanel({ 
  job, 
  isParsing, 
  onParse, 
  onCreateApplication, 
  onQuickATSCheck,
  resumes = [],
  onAttachResume,
  isAttaching = false
}: { 
  job: IJob; 
  isParsing: boolean; 
  onParse: () => void;
  onCreateApplication: () => void;
  onQuickATSCheck: () => void;
  resumes?: IResume[];
  onAttachResume: (resumeId: string) => void;
  isAttaching?: boolean;
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

      {/* Attach Resume Selector */}
      <div className="flex items-center gap-2 bg-slate-50 border p-3 rounded-lg flex-wrap justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-650 font-medium">
          <FileText className="w-4 h-4 text-primary" />
          {job.attachedResumeId ? (
            <span>
              Attached Resume:{' '}
              <strong className="text-slate-800">
                {resumes.find(r => r._id === job.attachedResumeId)?.versionLabel || 'Linked Resume'}
              </strong>
            </span>
          ) : (
            <span className="text-slate-500">No custom resume attached yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={job.attachedResumeId || ''}
            onChange={(e) => {
              if (e.target.value) {
                onAttachResume(e.target.value);
              }
            }}
            disabled={isAttaching}
            className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1 outline-none text-slate-700 focus:border-primary cursor-pointer"
          >
            <option value="">-- Link Resume --</option>
            {resumes.map((r) => (
              <option key={r._id} value={r._id}>
                {r.versionLabel} {r.atsScore ? `(${r.atsScore.overallScore} ATS)` : ''}
              </option>
            ))}
          </select>
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
    if (!form.companyName || !form.jobTitle || !form.location || !form.jdRawText) return;
    onSubmit({
      ...form,
      attachedResumeId: selectedResumeId || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold">Add New Job</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Integrate the job description and optionally attach a reference resume.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Company Name *</label>
                <input required placeholder="e.g. Stripe" value={form.companyName} onChange={(e) => setForm(f => ({...f, companyName: e.target.value}))} className="px-3.5 py-2 border rounded-lg text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder-gray-300" />
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Job Title *</label>
                <input required placeholder="e.g. Senior Frontend Engineer" value={form.jobTitle} onChange={(e) => setForm(f => ({...f, jobTitle: e.target.value}))} className="px-3.5 py-2 border rounded-lg text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder-gray-300" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Location *</label>
                <input required placeholder="e.g. San Francisco, CA / Remote" value={form.location} onChange={(e) => setForm(f => ({...f, location: e.target.value}))} className="px-3.5 py-2 border rounded-lg text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder-gray-300" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Job Link (optional)</label>
                <input placeholder="https://careers.stripe.com/..." value={form.jobLink} onChange={(e) => setForm(f => ({...f, jobLink: e.target.value}))} className="px-3.5 py-2 border rounded-lg text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder-gray-300" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Work Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['remote', 'hybrid', 'onsite'].map((wt) => {
                    const isSelected = form.workType === wt;
                    return (
                      <button
                        key={wt}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, workType: wt }))}
                        className={`py-2 border text-xs font-semibold rounded-lg capitalize cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary shadow-sm shadow-primary/5 font-bold'
                            : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        {wt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Employment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {['full-time', 'part-time', 'contract', 'internship'].map((et) => {
                    const isSelected = form.employmentType === et;
                    return (
                      <button
                        key={et}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, employmentType: et }))}
                        className={`py-2 border text-xs font-semibold rounded-lg capitalize cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary shadow-sm shadow-primary/5 font-bold'
                            : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        {et.replace('-', ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Resume Attachment Section */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Attach Reference Resume</label>
              {selectedResumeId && (
                <button
                  type="button"
                  onClick={() => setSelectedResumeId('')}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {resumes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {resumes.map((resume) => {
                  const isSelected = selectedResumeId === resume._id;
                  return (
                    <button
                      key={resume._id}
                      type="button"
                      onClick={() => setSelectedResumeId(isSelected ? '' : resume._id)}
                      className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/10' 
                          : 'border-gray-200 bg-white hover:border-gray-350 text-gray-750'
                      }`}
                    >
                      <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-gray-400'}`} />
                      <span>{resume.versionLabel || 'Resume'}</span>
                      {isSelected ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedResumeId('');
                          }}
                          className="hover:bg-primary/15 p-0.5 rounded transition-colors ml-1 cursor-pointer flex items-center justify-center"
                          title="Deselect"
                        >
                          <X className="w-3 h-3 text-primary font-bold" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-xs font-semibold hover:border-primary hover:text-primary transition-all bg-white hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-gray-400" />
                  <span>Upload New</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
                <span className="text-xs text-muted-foreground">No resumes available yet. Upload a master resume to get started.</span>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Upload PDF
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Job Description *</label>
            <textarea
              required rows={8}
              value={form.jdRawText}
              onChange={(e) => setForm(f => ({...f, jdRawText: e.target.value}))}
              placeholder="Paste the full job description here..."
              className="w-full px-4 py-2.5 border rounded-lg text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all resize-none animate-fade-in"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={isLoading || !form.companyName.trim() || !form.jobTitle.trim() || !form.location.trim() || !form.jdRawText.trim()} className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer shadow-sm shadow-primary/10">
              {isLoading ? 'Adding...' : 'Add Job'}
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

function RegisterSourceModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: '',
    sourceType: 'public_job_page',
    baseUrl: '',
    crawlFrequency: 1440,
    extractionStrategy: 'json_ld',
    trustScore: 1.0,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.baseUrl.trim()) {
      alert('Please fill in all required fields');
      return;
    }
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold">Register Ingestion Source</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Source Name *</label>
            <input
              type="text"
              placeholder="e.g. YCombinator Jobs"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Source Type *</label>
            <select
              value={form.sourceType}
              onChange={(e) => setForm(f => ({ ...f, sourceType: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="public_job_page">Crawler / Public Job Page</option>
              <option value="manual_paste">Manual Paste Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Base URL *</label>
            <input
              type="url"
              placeholder="https://www.workatastartup.com/jobs"
              value={form.baseUrl}
              onChange={(e) => setForm(f => ({ ...f, baseUrl: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Crawl Freq (mins)</label>
              <input
                type="number"
                min={0}
                value={form.crawlFrequency}
                onChange={(e) => setForm(f => ({ ...f, crawlFrequency: parseInt(e.target.value) || 1440 }))}
                className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Trust Score (0-1)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={form.trustScore}
                onChange={(e) => setForm(f => ({ ...f, trustScore: parseFloat(e.target.value) || 1.0 }))}
                className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Extraction Strategy</label>
            <select
              value={form.extractionStrategy}
              onChange={(e) => setForm(f => ({ ...f, extractionStrategy: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="json_ld">JSON-LD Metadata</option>
              <option value="html_metadata">HTML Metadata Scraper</option>
              <option value="manual_input">Manual Input Format</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer shadow-sm shadow-primary/10"
            >
              {isLoading ? 'Registering...' : 'Register Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
