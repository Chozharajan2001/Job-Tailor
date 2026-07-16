import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number>;
}

interface ApiResponse<T> {
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
    this.name = 'ApiError';
    this.response = {
      status,
      data
    };
  }
}

/**
 * Typed API client for JobTailor backend.
 * Auto-injects JWT tokens, handles errors consistently.
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    return localStorage.getItem('jobtailor-auth')
      ? JSON.parse(localStorage.getItem('jobtailor-auth')!).state?.accessToken || null
      : null;
  }

  async request<T>(endpoint: string, options: ApiOptions = {}): Promise<ApiResponse<T>> {
    const { params, ...fetchOptions } = options;
    const token = this.getToken();

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => searchParams.append(key, String(value)));
      url += `?${searchParams.toString()}`;
    }

    // Set headers
    const headers: Record<string, string> = {
      ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Send request with credentials: 'include' to pass cookies (for refreshToken)
    const response = await fetch(url, { ...fetchOptions, headers, credentials: 'include' });

    // Handle errors
    if (!response.ok) {
      // If 401 and we are not already requesting auth actions, try silent refresh
      if (
        response.status === 401 &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/register') &&
        !endpoint.includes('/auth/refresh')
      ) {
        try {
          const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            const newAccessToken = refreshData.data.accessToken;

            // Save new token to Zustand store
            useAuthStore.getState().setAccessToken(newAccessToken);

            // Retry original request with new token
            headers['Authorization'] = `Bearer ${newAccessToken}`;
            const retryResponse = await fetch(url, { ...fetchOptions, headers, credentials: 'include' });
            
            if (retryResponse.ok) {
              return retryResponse.json();
            }

            const errorBody = await retryResponse.json().catch(() => ({ error: { message: 'Request failed' } }));
            throw new ApiError(retryResponse.status, errorBody, errorBody.error?.message || `API Error: ${retryResponse.status}`);
          }
        } catch (refreshErr) {
          console.error('Silent refresh failed:', refreshErr);
        }

        // Trigger session expiration popup modal
        useAuthStore.getState().setSessionExpired(true);
      }

      const errorBody = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
      throw new ApiError(response.status, errorBody, errorBody.error?.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  get<T>(endpoint: string, params?: Record<string, string | number>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }

  patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
