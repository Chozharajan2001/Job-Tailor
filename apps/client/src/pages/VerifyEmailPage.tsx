import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useParams, Link } from "react-router-dom";
import { authService } from "../services/auth";
import { Loader2, CheckCircle, AlertCircle, Mail } from "lucide-react";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Supports both /verify-email?token=... and legacy /verify-email/<token> links
  const { token: routeToken } = useParams<{ token: string }>();
  const [token, setToken] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationExpires, setVerificationExpires] = useState<Date | null>(
    null,
  );

  // Get token from query param, route param, or location state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token") || routeToken;
    if (urlToken) {
      setToken(urlToken);
    }

    // Also check location state (from registration redirect)
    const state = location.state as {
      email?: string;
      message?: string;
      expires?: string;
    } | null;
    if (state) {
      if (state.email) setEmail(state.email);
      if (state.message) setMessage(state.message);
      if (state.expires) setVerificationExpires(new Date(state.expires));
    }
  }, [location, routeToken]);

  const handleVerify = useCallback(async () => {
    if (!token) {
      setError(
        "No verification token provided. Please check your email for the verification link.",
      );
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      await authService.verifyEmail(token);
      setSuccess(true);
      setMessage("Email verified successfully! You can now log in.");
    } catch (err: any) {
      const errorCode = err.response?.data?.error?.code;
      const errorMessage = err.response?.data?.error?.message || err.message;

      if (errorCode === "INVALID_VERIFICATION_TOKEN") {
        setError(
          "Invalid or expired verification token. Please request a new one.",
        );
      } else {
        setError(errorMessage || "Verification failed");
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  async function handleResend() {
    if (!email) {
      setError("Email is required to resend verification");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      await authService.resendVerificationEmail(email);
      setMessage("A new verification link has been sent to your email.");
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to resend verification",
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Auto-verify if token in URL
  useEffect(() => {
    if (token && !success && !isLoading) {
      handleVerify();
    }
  }, [token, success, isLoading, handleVerify]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">JobTailor</h1>
          <p className="text-muted-foreground mt-1">Verify your email</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4 border border-green-100">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">
              Email Verified!
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Your email has been verified. You can now sign in to your account.
            </p>
            <Link
              to="/login"
              className="inline-block w-full py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Sign In
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {message && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                {message}
              </div>
            )}

            {!email && (
              <div className="text-center">
                <Mail className="w-12 h-12 mx-auto mb-4 text-primary/50" />
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Check Your Email
                </h3>
                <p className="text-slate-500 text-sm mb-6">
                  We've sent a verification link to your email address. Click
                  the link in the email to verify your account.
                </p>
                <p className="text-xs text-slate-400">
                  The link expires in 24 hours.
                </p>
              </div>
            )}

            {email && (
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-sm text-slate-600">
                    Verification sent to{" "}
                    <strong className="text-slate-800">{email}</strong>
                  </p>
                  {verificationExpires && (
                    <p className="text-xs text-slate-500 mt-1">
                      Link expires: {verificationExpires.toLocaleString()}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleResend}
                  disabled={isLoading}
                  className="w-full py-2.5 border border-primary text-primary font-medium rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                      Sending...
                    </>
                  ) : (
                    "Resend Verification Email"
                  )}
                </button>

                <p className="text-xs text-slate-400 text-center">
                  Didn't receive the email? Check your spam folder.
                </p>
              </div>
            )}

            {!email && !token && (
              <div className="pt-4 border-t">
                <label className="block text-sm font-medium mb-1">
                  Enter Email to Resend
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already verified?{" "}
          <Link
            to="/login"
            className="text-primary font-medium hover:underline"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
