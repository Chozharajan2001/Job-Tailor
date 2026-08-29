import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/layout/Layout";
import { useAuthStore } from "./stores/authStore";
import SessionExpiredModal from "./components/SessionExpiredModal";
import { Toaster } from "react-hot-toast";

// Route-level code splitting — each page loads on demand
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const ResendVerificationPage = lazy(
  () => import("./pages/ResendVerificationPage"),
);
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const ResumeTailorPage = lazy(() => import("./pages/ResumeTailorPage"));
const TrackerPage = lazy(() => import("./pages/TrackerPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const InterviewModePage = lazy(() => import("./pages/InterviewModePage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

/**
 * Auth Guard — redirects to login if not authenticated.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full" />
      </div>
    );

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/reset-password/:token"
            element={<ResetPasswordPage />}
          />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Backwards-compatible path-param form used by older email links */}
          <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          <Route
            path="/resend-verification"
            element={<ResendVerificationPage />}
          />

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
      </Suspense>
      <SessionExpiredModal />
      <Toaster position="top-right" />
    </>
  );
}
