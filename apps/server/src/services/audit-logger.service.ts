import { config } from '../config/index.js';

export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'ACCOUNT_LOCKED'
  | 'EMAIL_VERIFIED'
  | 'LOGOUT_ALL'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'EMAIL_VERIFICATION_SENT'
  | 'EMAIL_VERIFIED'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'ALL_SESSIONS_REVOKED';

export interface AuditEventData {
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  fingerprintHash?: string;
  reason?: string;
  attempts?: number;
  lockDuration?: number;
  sessionId?: string;
  sessionCount?: number;
  [key: string]: unknown;
}

export interface AuditLogEntry {
  timestamp: string;
  eventType: AuditEventType;
  success: boolean;
  data: AuditEventData;
}

class AuditLogger {
  private isProduction: boolean;

  constructor() {
    this.isProduction = config.nodeEnv === 'production';
  }

  /**
   * Log a security audit event
   */
  log(eventType: AuditEventType, success: boolean, data: AuditEventData): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      success,
      data: {
        ...data,
        // Ensure IP and userAgent are always included when available
        ip: data.ip || 'unknown',
        userAgent: data.userAgent || 'unknown',
      },
    };

    if (this.isProduction) {
      // In production, send to structured logging service (e.g., Datadog, Logstash, CloudWatch)
      // For now, output JSON to stdout for log aggregation
      console.log(JSON.stringify(entry));
    } else {
      // In development, pretty print with colors
      const status = success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const color = success ? '\x1b[32m' : '\x1b[31m';
      const reset = '\x1b[0m';
      console.log(
        `${color}[AUDIT]${reset} ${entry.timestamp} ${status} ${eventType}`,
        JSON.stringify(data, null, 2)
      );
    }
  }

  // Convenience methods for common events

  loginSuccess(data: { userId: string; ip: string; userAgent: string; fingerprintHash?: string }): void {
    this.log('LOGIN_SUCCESS', true, data);
  }

  loginFailed(data: { email: string; ip: string; userAgent: string; reason: string; attempts?: number }): void {
    this.log('LOGIN_FAILED', false, data);
  }

  tokenRefreshed(data: { userId: string; ip: string; fingerprintHash?: string }): void {
    this.log('TOKEN_REFRESHED', true, data);
  }

  tokenRevoked(data: { userId: string; reason: string; ip?: string }): void {
    this.log('TOKEN_REVOKED', true, { ...data, reason: data.reason });
  }

  passwordChanged(data: { userId: string; ip: string }): void {
    this.log('PASSWORD_CHANGED', true, data);
  }

  accountLocked(data: { email: string; ip: string; attempts: number; lockDuration: number }): void {
    this.log('ACCOUNT_LOCKED', true, data);
  }

  emailVerified(data: { userId: string; ip: string }): void {
    this.log('EMAIL_VERIFIED', true, data);
  }

  logoutAll(data: { userId: string; ip: string; sessionCount: number }): void {
    this.log('LOGOUT_ALL', true, data);
  }

  passwordResetRequested(data: { email: string; ip: string }): void {
    this.log('PASSWORD_RESET_REQUESTED', true, data);
  }

  passwordResetCompleted(data: { userId: string; ip: string }): void {
    this.log('PASSWORD_RESET_COMPLETED', true, data);
  }

  emailVerificationSent(data: { email: string; ip: string }): void {
    this.log('EMAIL_VERIFICATION_SENT', true, data);
  }

  sessionCreated(data: { userId: string; ip: string; userAgent: string; fingerprintHash?: string }): void {
    this.log('SESSION_CREATED', true, data);
  }

  sessionRevoked(data: { userId: string; reason: string; ip?: string }): void {
    this.log('SESSION_REVOKED', true, { ...data, reason: data.reason });
  }

  allSessionsRevoked(data: { userId: string; reason: string; ip?: string; sessionCount: number }): void {
    this.log('ALL_SESSIONS_REVOKED', true, data);
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();