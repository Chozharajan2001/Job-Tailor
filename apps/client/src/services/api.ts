import { useAuthStore } from "../stores/authStore";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

export class ApiError extends Error {
  response?: {
    status: number;
    data: any;
  };

  constructor(status: number, data: any, message: string) {
    super(message);
    this.name = "ApiError";
    this.response = {
      status,
      data,
    };
  }
}

/**
 * Typed API client for JobTailor backend.
 * Auto-injects JWT tokens, handles errors consistently.
 * Access token stored in memory (Zustand), refresh token in HttpOnly cookie.
 */
class ApiClient {
  private baseUrl: string;
  private refreshMutex: Promise<string> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    // Read access token from Zustand memory state (not localStorage)
    return useAuthStore.getState().accessToken;
  }

  private setToken(token: string): void {
    useAuthStore.getState().setAccessToken(token);
  }

  /**
   * Get or create a mutex for silent refresh to prevent race conditions
   */
  private getRefreshMutex(): Promise<string> {
    if (!this.refreshMutex) {
      this.refreshMutex = this.performSilentRefresh().finally(() => {
        this.refreshMutex = null;
      });
    }
    return this.refreshMutex;
  }

  /**
   * Public silent refresh — used on app boot to restore a session from the
   * HttpOnly refresh cookie. Returns true when a fresh access token was set.
   */
  async trySilentRefresh(): Promise<boolean> {
    try {
      await this.getRefreshMutex();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Perform silent token refresh using HttpOnly refresh cookie
   */
  private async performSilentRefresh(): Promise<string> {
    const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!refreshRes.ok) {
      // Refresh failed - trigger session expiry
      useAuthStore.getState().setSessionExpired(true);
      throw new Error("Token refresh failed");
    }

    const refreshData = await refreshRes.json().catch(() => null);
    const newAccessToken = refreshData?.data?.accessToken;

    if (typeof newAccessToken !== "string" || newAccessToken.length === 0) {
      useAuthStore.getState().setSessionExpired(true);
      throw new Error("Token refresh returned an invalid payload");
    }

    // Save new token to Zustand store (memory only)
    this.setToken(newAccessToken);

    return newAccessToken;
  }

  /**
   * Proactively refresh token before expiry (at 80% lifetime)
   * For 15min token, refresh at 12min
   */
  private proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleProactiveRefresh(token: string): void {
    // Clear existing timer
    if (this.proactiveRefreshTimer) {
      clearTimeout(this.proactiveRefreshTimer);
    }

    try {
      // Decode JWT to get expiry
      const parts = token.split(".");
      if (parts.length !== 3) return;

      const payloadPart = parts[1];
      if (!payloadPart) return;

      const payload = JSON.parse(atob(payloadPart));
      if (typeof payload.exp !== "number") return;

      const expiry = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const lifetime = expiry - now;

      // Refresh at 80% of lifetime (e.g., 12min for 15min token)
      const refreshAt = lifetime * 0.8;

      if (refreshAt > 0 && refreshAt < lifetime) {
        this.proactiveRefreshTimer = setTimeout(() => {
          this.getRefreshMutex().catch(() => {
            // Silent refresh failed - session expired modal will handle
          });
        }, refreshAt);
      }
    } catch {
      // Ignore decode errors
    }
  }

  async request<T>(
    endpoint: string,
    options: ApiOptions = {},
  ): Promise<ApiResponse<T>> {
    const { params, ...fetchOptions } = options;
    const token = this.getToken();

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) =>
        searchParams.append(key, String(value)),
      );
      url += `?${searchParams.toString()}`;
    }

    // Set headers
    const headers: Record<string, string> = {
      ...(!(options.body instanceof FormData) && {
        "Content-Type": "application/json",
      }),
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      // Schedule proactive refresh
      this.scheduleProactiveRefresh(token);
    }

    // Send request with credentials: 'include' to pass cookies (for refreshToken).
    // Network failures (offline, DNS, CORS) are normalized into a typed ApiError.
    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        0,
        null,
        "Network error — please check your connection and try again.",
      );
    }

    // Handle errors
    if (!response.ok) {
      // If 401 and we are not already requesting auth actions, try silent refresh
      if (
        response.status === 401 &&
        !endpoint.includes("/auth/login") &&
        !endpoint.includes("/auth/register") &&
        !endpoint.includes("/auth/refresh")
      ) {
        try {
          // Use mutex to prevent multiple concurrent refreshes
          const newAccessToken = await this.getRefreshMutex();

          // Retry original request with new token
          headers["Authorization"] = `Bearer ${newAccessToken}`;
          const retryResponse = await fetch(url, {
            ...fetchOptions,
            headers,
            credentials: "include",
          });

          if (retryResponse.ok) {
            return retryResponse.json();
          }

          const errorBody = await retryResponse
            .json()
            .catch(() => ({ error: { message: "Request failed" } }));
          throw new ApiError(
            retryResponse.status,
            errorBody,
            errorBody.error?.message || `API Error: ${retryResponse.status}`,
          );
        } catch (refreshErr) {
          console.error("Silent refresh failed:", refreshErr);
          // Trigger session expiration popup modal
          useAuthStore.getState().setSessionExpired(true);
        }
      }

      const errorBody = await response
        .json()
        .catch(() => ({ error: { message: "Request failed" } }));
      throw new ApiError(
        response.status,
        errorBody,
        errorBody.error?.message || `API Error: ${response.status}`,
      );
    }

    return response.json();
  }

  get<T>(
    endpoint: string,
    params?: Record<string, string | number>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET", params });
  }

  post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const api = new ApiClient(API_BASE);
