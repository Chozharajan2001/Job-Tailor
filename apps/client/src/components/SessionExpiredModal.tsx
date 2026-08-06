import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';
import { KeyRound, Loader2, AlertCircle, LogOut } from 'lucide-react';

export default function SessionExpiredModal() {
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!sessionExpired) return null;

  function handleLogout() {
    api.post('/auth/logout').catch(() => {});
    clearAuth();
    navigate('/login');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{ user: any; accessToken: string }>('/auth/login', {
        email,
        password,
      });

      setAuth(res.data.user, res.data.accessToken);
      setPassword('');
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          'Failed to login. Please check credentials.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 animate-in zoom-in-95 duration-300">
        <div className="p-8">
          {/* Icon Header */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100 animate-bounce">
              <KeyRound className="w-6 h-6" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Session Expired</h3>
            <p className="text-sm text-slate-500 mt-2">
              For your security, please sign back in to continue working without losing your changes.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-start gap-3 text-sm animate-in shake duration-200">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition duration-150 text-slate-800 placeholder-slate-400 bg-slate-50/50"
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition duration-150 text-slate-800 placeholder-slate-400 bg-slate-50/50"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold shadow-lg shadow-slate-950/10 hover:shadow-xl transition-all duration-150 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing back in...</span>
                </>
              ) : (
                <span>Confirm Password</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
