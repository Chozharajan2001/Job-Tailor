import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Download, FileText, Plus, GripVertical } from 'lucide-react';
import CreateApplicationModal from '../components/CreateApplicationModal';
import { DndContext, useDraggable, useDroppable, DragEndEvent } from '@dnd-kit/core';

// ─── Types ────────────────────────────────────────────────────
interface IApplication {
  _id: string;
  jobId: { _id: string; companyName: string; jobTitle: string; location?: string; workType?: string };
  resumeId?: { _id: string; versionLabel?: string; atsScore?: { overallScore: number }; pdfUrl?: string };
  status: string;
  timelineEvents: Array<{ event: string; description: string; eventDate: string; type: string }>;
  createdAt: string;
}

const KANBAN_COLUMNS = [
  { key: 'saved', label: 'Saved', color: 'bg-gray-100 border-gray-300' },
  { key: 'applied', label: 'Applied', color: 'bg-blue-50 border-blue-200' },
  { key: 'screening', label: 'Screening', color: 'bg-yellow-50 border-yellow-200' },
  { key: 'interview', label: 'Interview', color: 'bg-purple-50 border-purple-200' },
  { key: 'offer', label: 'Offer', color: 'bg-green-50 border-green-200' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-50 border-red-200' },
] as const;

type KanbanColumnData = (typeof KANBAN_COLUMNS)[number] & { apps: IApplication[] };

export default function TrackerPage() {
  const queryClient = useQueryClient();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ─── Search & Filter States ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [resumeFilter, setResumeFilter] = useState('all');

  // ─── PDF Download Mutation ──────────────────────────────────
  const downloadPDFMutation = useMutation({
    mutationFn: (resumeId: string) => api.post<{ pdfUrl: string }>(`/resumes/${resumeId}/pdf`),
    onSuccess: (response) => {
      window.open(response.data.pdfUrl, '_blank');
    },
    onError: (error: any) => {
      console.error('PDF download failed:', error);
      alert('Failed to generate PDF. Please try again.');
    },
  });

  // ─── Delete Application Mutation ────────────────────────────
  const deleteAppMutation = useMutation({
    mutationFn: (appId: string) => api.delete(`/applications/${appId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowDetail(false);
    },
  });

  // ─── Handle Drag End ────────────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const appId = active.id as string;
    const newStatus = over.id as string;

    const app = allApps.find((a) => a._id === appId);
    if (app && app.status !== newStatus) {
      statusMutation.mutate({ appId, status: newStatus });
    }
  }

  // ─── Handle URL Parameters for Auto-Create Application ──────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('jobId');
    const resumeId = params.get('resumeId');

    if (jobId && resumeId) {
      // Auto-open create application modal with pre-filled values
      setShowCreateModal(true);
      // Clean URL without refreshing
      window.history.replaceState({}, '', '/tracker');
    }
  }, []);

  // ─── Fetch All Applications ──────────────────────────────────
  const { data: appsRes, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => api.get<{ applications: IApplication[] }>('/applications'),
    refetchInterval: false,
  });
  const allApps = appsRes?.data?.applications || [];

  // ─── Status Update Mutation ──────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ appId, status, note }: { appId: string; status: string; note?: string }) =>
      api.patch(`/applications/${appId}/status`, { status, note }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['applications'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  // ─── Add Note Mutation ───────────────────────────────────────
  const addNoteMutation = useMutation({
    mutationFn: ({ appId, content }: { appId: string; content: string }) =>
      api.post(`/applications/${appId}/notes`, { content }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['applications'] }); },
  });

  // ─── Filter & Dynamic Stats Logic ───────────────────────────
  const uniqueResumes = Array.from(
    new Set(
      allApps
        .map((app) => app.resumeId?.versionLabel)
        .filter((label): label is string => !!label)
    )
  );

  const filteredApps = allApps.filter((app) => {
    const matchesSearch =
      app.jobId.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.jobId.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.jobId.location && app.jobId.location.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesResume =
      resumeFilter === 'all' ||
      app.resumeId?.versionLabel === resumeFilter;

    return matchesSearch && matchesResume;
  });

  // Group by column
  const grouped = KANBAN_COLUMNS.map((col) => ({
    ...col,
    apps: filteredApps.filter((a) => a.status === col.key),
  }));

  const selectedApp = selectedAppId ? allApps.find((a) => a._id === selectedAppId) : null;

  return (
    <div className="p-8 max-w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Application Tracker</h1>
          <p className="text-muted-foreground mt-1">
            {filteredApps.length === allApps.length
              ? `${allApps.length} applications across pipeline stages`
              : `${filteredApps.length} of ${allApps.length} matching`}
          </p>
        </div>
        
        {/* Create Application Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Application
        </button>
      </div>

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
              placeholder="Search applications by title, company, or location..."
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
          <div className="flex gap-2">
            <select
              value={resumeFilter}
              onChange={(e) => setResumeFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer min-w-[180px]"
            >
              <option value="all">All Resume Versions</option>
              {uniqueResumes.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
            {(searchQuery || resumeFilter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setResumeFilter('all'); }}
                className="text-xs text-primary font-semibold px-2 hover:underline cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Create Application Modal */}
      {showCreateModal && (
        <CreateApplicationModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* Kanban Board */}
      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
          {grouped.map((column) => (
            <KanbanColumn
              key={column.key}
              column={column}
              onCardClick={(appId) => { setSelectedAppId(appId); setShowDetail(true); }}
              onStatusChange={(appId, newStatus) => statusMutation.mutate({ appId, status: newStatus })}
            />
          ))}
        </div>
      </DndContext>

      {/* Detail Modal */}
      {showDetail && selectedApp && (
        <ApplicationDetailModal
          application={selectedApp}
          onClose={() => setShowDetail(false)}
          onStatusChange={(status) => {
            statusMutation.mutate({ appId: selectedApp._id, status });
          }}
          onAddNote={(content) => {
            addNoteMutation.mutate({ appId: selectedApp._id, content });
          }}
          onDownloadPDF={() => {
            if (selectedApp.resumeId?._id) {
              downloadPDFMutation.mutate(selectedApp.resumeId._id);
            }
          }}
          isDownloadingPDF={downloadPDFMutation.isPending}
          onDelete={() => {
            if (window.confirm('Are you sure you want to delete this application?')) {
              deleteAppMutation.mutate(selectedApp._id);
            }
          }}
          isDeleting={deleteAppMutation.isPending}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════

function KanbanColumn({
  column,
  onCardClick,
  onStatusChange,
}: {
  column: KanbanColumnData;
  onCardClick: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
  });
  const apps = column.apps;

  return (
    <div 
      ref={setNodeRef} 
      className={`min-w-[280px] w-[280px] rounded-xl border ${column.color} flex flex-col transition-all ${
        isOver ? 'ring-2 ring-primary ring-offset-1 scale-[1.01] shadow-md' : ''
      }`}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{column.label}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            column.key === 'rejected' || column.key === 'saved' ? 'bg-white/60 text-gray-600' :
            column.key === 'offer' ? 'bg-green-100 text-green-700' : 'bg-gray-100'
          }`}>
            {apps.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-14rem)]">
        {apps.length === 0 && (
          <p className="text-xs text-center text-muted-foreground py-8">No applications</p>
        )}

        {apps.map((app) => (
          <ApplicationCard
            key={app._id}
            app={app}
            onClick={() => onCardClick(app._id)}
            currentStatus={app.status}
            onStatusChange={(newStatus) => onStatusChange(app._id, newStatus)}
            columns={KANBAN_COLUMNS}
          />
        ))}
      </div>
    </div>
  );
}

function ApplicationCard({
  app,
  onClick,
  currentStatus,
  onStatusChange,
  columns,
}: {
  app: IApplication;
  onClick: () => void;
  currentStatus: string;
  onStatusChange: (s: string) => void;
  columns: typeof KANBAN_COLUMNS;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app._id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 40,
  } : undefined;

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border shadow-sm p-3 hover:shadow-md transition-all relative ${
        isDragging ? 'opacity-50 ring-2 ring-primary border-transparent z-50 scale-95 shadow-lg' : ''
      }`} 
      onClick={() => { onClick(); setShowMenu(false); }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1 flex gap-2 items-start">
          <div 
            {...listeners} 
            {...attributes} 
            className="cursor-grab active:cursor-grabbing p-1 -mt-1 -ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-sm truncate">{app.jobId.jobTitle}</h4>
            <p className="text-xs text-primary truncate">{app.jobId.companyName}</p>
          </div>
        </div>

        {/* Quick Status Change Menu */}
        <div className="relative ml-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="text-gray-400 hover:text-gray-600 p-0.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-6 bg-white border rounded-lg shadow-xl z-10 py-1 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
              {columns.map((col) => (
                <button
                  key={col.key}
                  disabled={col.key === currentStatus}
                  onClick={() => { onStatusChange(col.key); setShowMenu(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${col.key === currentStatus ? 'font-medium text-primary bg-primary/5 cursor-default' : ''}`}
                >
                  Move to {col.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card Meta */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {app.resumeId?.atsScore && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            app.resumeId.atsScore.overallScore >= 75 ? 'bg-green-50 text-green-700' :
            app.resumeId.atsScore.overallScore >= 50 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'
          }`}>
            ATS: {app.resumeId.atsScore.overallScore}
          </span>
        )}
        {app.resumeId?.versionLabel && (
          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{app.resumeId.versionLabel}</span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(app.createdAt)}</span>
      </div>
    </div>
  );
}

function ApplicationDetailModal({
  application,
  onClose,
  onStatusChange,
  onAddNote,
  onDownloadPDF,
  isDownloadingPDF,
  onDelete,
  isDeleting,
}: {
  application: IApplication;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onAddNote: (content: string) => void;
  onDownloadPDF?: () => void;
  isDownloadingPDF?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}) {
  const [noteText, setNoteText] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'notes'>('details');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{application.jobId.jobTitle}</h2>
            <p className="text-primary font-medium">{application.jobId.companyName}</p>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${statusBadgeColor(application.status)}`}>{application.status}</span>
              {application.resumeId?.atsScore && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">ATS: {application.resumeId.atsScore.overallScore}/100</span>}
              <span className="text-xs text-muted-foreground">Applied: {formatRelativeTime(application.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Download PDF Button */}
            {onDownloadPDF && application.resumeId && (
              <button
                onClick={onDownloadPDF}
                disabled={isDownloadingPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
                title="Download Resume PDF"
              >
                {isDownloadingPDF ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    PDF
                  </>
                )}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">&times;</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 bg-gray-50 border-b">
          {[{key: 'details', label: 'Details'}, {key: 'timeline', label: `Timeline (${application.timelineEvents?.length || 0})`}, {key: 'notes', label: '+ Note'}].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)} className={`px-3 py-1.5 text-sm rounded-md cursor-pointer ${activeTab === tab.key ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'details' && (
            <div className="space-y-3">
              <InfoRow label="Resume Used" value={application.resumeId?.versionLabel || 'N/A'} />
              <InfoRow label="Location" value={application.jobId.location || '-'} />
              <InfoRow label="Work Type" value={application.jobId.workType || '-'} />

              <div>
                <label className="block text-sm font-medium mb-2">Move to Stage:</label>
                <div className="flex flex-wrap gap-2">
                  {KANBAN_COLUMNS.map((col) => (
                    <button key={col.key} onClick={() => onStatusChange(col.key)} disabled={col.key === application.status}
                      className={`px-3 py-1.5 text-sm rounded-lg border cursor-pointer transition-colors ${col.key === application.status ? 'border-transparent font-medium' : 'hover:border-gray-300'} ${statusBgColor(col.key)}`}
                    >{col.label}</button>
                  ))}
                </div>
              </div>

              {onDelete && (
                <div className="pt-4 border-t mt-4">
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting Application...' : '🗑️ Delete Application'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {(application.timelineEvents || []).length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No timeline events yet.</p>
              ) : (
                application.timelineEvents.map((event, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${timelineDotColor(event.type)}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.event}</p>
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{new Date(event.eventDate).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-3">
              <textarea
                rows={3}
                placeholder="Add a note... (e.g., 'Spoke with recruiter Priya, follow up Friday')"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg text-sm resize-none"
              />
              <button
                onClick={() => { if (noteText.trim()) { onAddNote(noteText); setNoteText(''); } }}
                disabled={!noteText.trim()}
                className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
              >
                Add Note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function statusBadgeColor(status: string): string {
  const map: Record<string, string> = {
    saved: 'bg-gray-100 text-gray-700', applied: 'bg-blue-50 text-blue-700', screening: 'bg-yellow-50 text-yellow-700',
    interview: 'bg-purple-50 text-purple-700', offer: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-700';
}

function statusBgColor(status: string): string {
  const map: Record<string, string> = {
    saved: 'bg-gray-50 text-gray-700', applied: 'bg-blue-50 text-blue-700', screening: 'bg-yellow-50 text-yellow-800',
    interview: 'bg-purple-50 text-purple-700', offer: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-700',
  };
  return map[status] || 'bg-gray-50';
}

function timelineDotColor(type: string): string {
  const map: Record<string, string> = {
    status_change: 'bg-blue-500', note: 'bg-green-500', reminder: 'bg-orange-500',
    follow_up: 'bg-purple-500', interview_schedule: 'bg-indigo-500',
  };
  return map[type] || 'bg-gray-400';
}
