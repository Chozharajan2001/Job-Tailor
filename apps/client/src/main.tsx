import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuthStore } from "./stores/authStore";
import { ApiError } from "./services/api";
import "./styles/globals.css";

/** Extract a user-friendly message from any thrown error. */
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const apiMsg = (
      err.response?.data as { error?: { message?: string } } | null
    )?.error?.message;
    return apiMsg || err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  // Global safety net: no mutation/query failure is ever silently swallowed.
  // Individual handlers can opt out by setting meta: { silentError: true }.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if ((mutation.meta as { silentError?: boolean } | undefined)?.silentError)
        return;
      toast.error(errorMessage(error));
    },
  }),
});

// Initialize auth state on app startup
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthInitializer>
            <App />
          </AuthInitializer>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
