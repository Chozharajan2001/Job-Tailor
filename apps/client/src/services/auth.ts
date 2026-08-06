import { api } from './api';

interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface ForgotPasswordResponse {
  message: string;
}

interface RegisterResponse {
  user: User;
  message: string;
  verificationExpires: string;
  verificationToken?: string;
}

export const authService = {
  async register(data: { email: string; password: string; firstName: string; lastName: string; fingerprint?: any }): Promise<RegisterResponse> {
    const response = await api.post<RegisterResponse>('/auth/register', data);
    return response.data;
  },

  async login(email: string, password: string, fingerprint?: any): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', { email, password, fingerprint });
    return response.data;
  },

  async getMe(): Promise<{ user: User }> {
    const response = await api.get<{ user: User }>('/auth/me');
    return response.data;
  },

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>('/auth/forgot-password', { email });
    return response.data;
  },

  async resetPassword(token: string, password: string): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>('/auth/reset-password', { token, password });
    return response.data;
  },

  async verifyEmail(token: string): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>('/auth/verify-email', { token });
    return response.data;
  },

  async resendVerificationEmail(email: string): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>('/auth/resend-verification', { email });
    return response.data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  },

  async logoutAll(): Promise<ForgotPasswordResponse> {
    const response = await api.post<ForgotPasswordResponse>('/auth/logout-all');
    return response.data;
  },
};
