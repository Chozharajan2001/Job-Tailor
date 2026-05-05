import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';

// Pages (to be implemented per phase)
const Dashboard = () => <div className="p-6">Dashboard — Coming Phase 4</div>;
const LoginPage = () => <div className="p-6">Login — Coming Phase 2</div>;
const RegisterPage = () => <div className="p-6">Register — Coming Phase 2</div>;
const ProfilePage = () => <div className="p-6">Master Profile — Coming Phase 5</div>;
const JobsPage = () => <div className="p-6">Jobs — Coming Phase 6</div>;
const ResumeTailorPage = () => <div className="p-6">Resume Tailor — Coming Phase 6</div>;
const TrackerPage = () => <div className="p-6">Application Tracker — Coming Phase 7</div>;
const InterviewModePage = () => <div className="p-6">Interview Mode — Coming Phase 8</div>;
const AnalyticsPage = () => <div className="p-6">Analytics — Coming Phase 7</div>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="tailor" element={<ResumeTailorPage />} />
        <Route path="tracker" element={<TrackerPage />} />
        <Route path="interview/:id" element={<InterviewModePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
      </Route>
    </Routes>
  );
}
