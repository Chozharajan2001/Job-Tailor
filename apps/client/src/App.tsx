import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { useAuthStore } from './stores/authStore';

// Real pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import JobsPage from './pages/JobsPage';
import ResumeTailorPage from './pages/ResumeTailorPage';

// Placeholder pages (coming in later phases)
const TrackerPage = () => (
  <div className="p-8 text-center">
    <h2 className="text-xl font-semibold mb-2">Application Tracker (Kanban)</h2>
    <p className="text-muted-foreground mb-4">Track all applications across the hiring pipeline.</p>
    <span className="inline-block px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-sm border border-yellow-200">Coming in Phase 7</span>
  </div>
);
const InterviewModePage = () => (
  <div className="p-8 text-center">
    <h2 className="text-xl font-semibold mb-2">Interview Mode</h2>
    <p className="text-muted-foreground mb-4">Split-screen view: JD + your tailored resume side by side.</p>
    <span className="inline-block px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-sm border border-yellow-200">Coming in Phase 8</span>
  </div>
);
const AnalyticsPage = () => (
  <div className="p-8 text-center">
    <h2 className="text-xl font-semibold mb-2">Analytics & Insights</h2>
    <p className="text-muted-foreground mb-4">Learn which resumes get callbacks vs. rejections.</p>
    <span className="inline-block px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-sm border border-yellow-200">Coming in Phase 7</span>
  </div>
);

/**
 * Auth Guard — redirects to login if not authenticated.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" /></div>;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="tailor" element={<ResumeTailorPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="interview/:id" element={<InterviewModePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
