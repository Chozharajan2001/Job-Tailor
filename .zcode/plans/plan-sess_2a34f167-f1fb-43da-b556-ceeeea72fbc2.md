# Comprehensive Authentication Security Hardening - Implementation Plan

## Overview
Fix all 10 identified security gaps in the JobTailor authentication system. Based on user decisions:
- **Access Token**: Memory (React state) + HttpOnly refresh cookie
- **Refresh Rotation**: Single token rotation with hash storage
- **Email Verification**: Required before login

---

## Phase 1: Core Infrastructure (Foundation)

### 1.1 Update User Model (`apps/server/src/models/User.model.ts`)
Add fields for refresh token management and email verification:
```typescript
// New fields
refreshTokenHash?: string;           // bcrypt hash of current refresh token
refreshTokenExpires?: Date;          // Expiry for current refresh token
emailVerified: boolean;              // Default: false
emailVerificationToken?: string;     // For verification email
emailVerificationExpires?: Date;     // Token expiry
loginAttempts: number;               // For brute force protection
lockUntil?: Date;                    // Account lockout timestamp
lastFailedLogin?: Date;              // Track failed attempts
```

### 1.2 Update Config (`apps/server/src/config/index.ts`)
Add new config options:
```typescript
emailVerificationExpiry: process.env.EMAIL_VERIFICATION_EXPIRY || '24h',
maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
lockoutDuration: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5', 10),
```

### 1.3 Create Audit Logger Service (`apps/server/src/services/audit-logger.service.ts`)
New service for security event logging:
- Structured logging (JSON) for: login, logout, token refresh, password change, failed attempts, lockouts
- Log to console (dev) / external service (prod)
- Include: userId, IP, userAgent, timestamp, eventType, success/failure, details

---

## Phase 2: Refresh Token Rotation & Revocation

### 2.1 Update Auth Service (`apps/server/src/services/auth.service.ts`)

**New/Modified Functions:**
- `generateTokens()` → Returns `{ accessToken, refreshToken, refreshTokenHash, refreshTokenExpires }`
- `rotateRefreshToken(userId, oldRefreshToken)` → Verify old hash, generate new token pair, update DB
- `revokeRefreshToken(userId)` → Clear refresh token fields (logout)
- `revokeAllUserTokens(userId)` → Clear all tokens (logout everywhere / password change)
- `isTokenRevoked(refreshTokenHash)` → Check if token is valid

**Modified Functions:**
- `loginUser()` → Generate refresh token, hash it, store in user document
- `refreshTokenService()` → Verify hash matches, rotate token, update hash
- `logout()` → Call `revokeRefreshToken()`

### 2.2 Update Auth Controller (`apps/server/src/controllers/auth.controller.ts`)
- `login` → Return new token structure
- `refresh` → Call rotation logic
- `logout` → Revoke refresh token
- Add new: `logoutAllDevices` endpoint

### 2.3 Update Auth Routes (`apps/server/src/routes/auth.routes.ts`)
- Add `POST /logout-all` (authenticated)
- Update refresh validation if needed

---

## Phase 3: Access Token Storage (Client-Side)

### 3.1 Update Auth Store (`apps/client/src/stores/authStore.ts`)
**Changes:**
- Remove `accessToken` from persist (only persist `user`)
- Add `setAccessToken()` that updates memory only
- Add `getAccessToken()` selector for components
- Keep `sessionExpired` in persist

```typescript
// New persist config
{ name: 'jobtailor-auth', partialize: (state) => ({ user: state.user, sessionExpired: state.sessionExpired }) }
```

### 3.2 Update API Client (`apps/client/src/services/api.ts`)
**Changes:**
- `getToken()` → Read from Zustand memory state (not localStorage)
- Add mutex/lock for silent refresh to prevent race conditions
- Proactive refresh at 80% token lifetime (12min for 15min token)

### 3.3 Update Login/Register Pages
- Remove localStorage accessToken handling
- Use `setAuth(user, accessToken)` from store

---

## Phase 4: Per-Endpoint Rate Limiting

### 4.1 Create Auth Rate Limiters (`apps/server/src/app.ts` or new middleware)
```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 min
  keyGenerator: (req) => req.ip,
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many auth attempts' } }
});

const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Stricter for sensitive endpoints
  keyGenerator: (req) => req.ip,
});
```

### 4.2 Apply to Auth Routes (`apps/server/src/routes/auth.routes.ts`)
```typescript
router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', strictAuthLimiter, validateBody(loginSchema), login);
router.post('/forgot-password', strictAuthLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), resetPasswordHandler);
router.post('/refresh', authLimiter, validateBody(refreshTokenSchema), refresh);
```

---

## Phase 5: Email Verification (Required Before Login)

### 5.1 Update Auth Service
- `registerUser()` → Create user with `emailVerified: false`, generate verification token, send email
- `verifyEmail(token)` → Verify token, set `emailVerified: true`, clear token fields
- `resendVerificationEmail(email)` → Generate new token, send email
- `loginUser()` → Check `emailVerified`, throw `EMAIL_NOT_VERIFIED` if false

### 5.2 Update Auth Controller
- `register` → Return message about verification email sent (no tokens)
- Add `verifyEmail` handler
- Add `resendVerification` handler

### 5.3 Update Auth Routes
```typescript
router.post('/verify-email', validateBody(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', authLimiter, validateBody(resendSchema), resendVerification);
```

### 5.4 Client: New Pages
- `VerifyEmailPage.tsx` → Handle verification link, show success/error
- `ResendVerificationPage.tsx` → Form to resend email
- Update `LoginPage.tsx` → Handle `EMAIL_NOT_VERIFIED` error, link to resend page

---

## Phase 6: Brute Force Protection

### 6.1 Update Auth Service (`loginUser`)
- Check `lockUntil` → If future, throw `ACCOUNT_LOCKED`
- On failed attempt: increment `loginAttempts`, set `lastFailedLogin`
- If `loginAttempts >= maxLoginAttempts`: set `lockUntil = now + lockoutDuration`
- On success: reset `loginAttempts = 0`, clear `lockUntil`, `lastFailedLogin`

### 6.2 Update Auth Controller
- Return appropriate error codes: `ACCOUNT_LOCKED`, `INVALID_CREDENTIALS`

---

## Phase 7: Concurrent Session Limit

### 7.1 Update User Model
Add array field for active sessions:
```typescript
activeSessions: [{
  refreshTokenHash: string;
  userAgent: string;
  ip: string;
  createdAt: Date;
  lastUsedAt: Date;
}];
```

### 7.2 Update Auth Service
- `loginUser()` → Add session to array, enforce limit (remove oldest if exceeded)
- `rotateRefreshToken()` → Update session's `lastUsedAt`
- `revokeRefreshToken()` → Remove specific session
- `revokeAllUserTokens()` → Clear all sessions

---

## Phase 8: Device Fingerprinting

### 8.1 Client: Collect Fingerprint
```typescript
// In login/register
const fingerprint = {
  userAgent: navigator.userAgent,
  language: navigator.language,
  platform: navigator.platform,
  screenResolution: `${screen.width}x${screen.height}`,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};
```

### 8.2 Server: Bind to Session
- Store fingerprint hash in session object
- On refresh, verify fingerprint matches (warn but don't block)
- Log fingerprint mismatches to audit log

---

## Phase 9: Security Audit Logging

### 9.1 Create Audit Events
Log these events with structured data:
| Event | Data |
|-------|------|
| `LOGIN_SUCCESS` | userId, ip, userAgent, fingerprint |
| `LOGIN_FAILED` | email, ip, userAgent, reason |
| `TOKEN_REFRESHED` | userId, ip, oldTokenId |
| `TOKEN_REVOKED` | userId, reason (logout/password_change/security) |
| `PASSWORD_CHANGED` | userId, ip |
| `ACCOUNT_LOCKED` | email, ip, attempts |
| `EMAIL_VERIFIED` | userId |
| `LOGOUT_ALL` | userId, ip |

### 9.2 Integration Points
- Call audit logger in: `loginUser`, `refreshTokenService`, `logout`, `resetPassword`, `verifyEmail`, `lockAccount`

---

## Phase 10: Configuration Hardening

### 10.1 Update Config Validation (`apps/server/src/config/index.ts`)
```typescript
export function validateConfig(): void {
  if (!config.mongodb.uri) throw new Error('MONGODB_URI is required');
  if (!config.jwt.secret || config.jwt.secret.includes('fallback')) {
    if (config.nodeEnv === 'production') throw new Error('JWT_SECRET must be set in production');
    console.warn('⚠️  Using default JWT secret — set JWT_SECRET in production');
  }
  if (!config.jwt.refreshSecret || config.jwt.refreshSecret.includes('fallback')) {
    if (config.nodeEnv === 'production') throw new Error('JWT_REFRESH_SECRET must be set in production');
  }
  // ... existing validation
}
```

### 10.2 Update CORS for Multiple Origins
```typescript
corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
```
Update `app.ts` to handle array:
```typescript
cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigin.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
})
```

---

## File Changes Summary

| File | Phase | Changes |
|------|-------|---------|
| `User.model.ts` | 1.1, 7 | New fields for tokens, sessions, verification, lockout |
| `config/index.ts` | 1.2, 10 | New config options, CORS array |
| `auth.service.ts` | 2, 5, 6, 7 | Rotation, revocation, verification, lockout, sessions |
| `auth.controller.ts` | 2, 5 | New endpoints, updated responses |
| `auth.routes.ts` | 2, 4, 5 | Rate limiters, new routes |
| `audit-logger.service.ts` | 1.3, 9 | New service |
| `authStore.ts` | 3.1 | Remove accessToken from persist |
| `api.ts` | 3.2 | Memory token, mutex, proactive refresh |
| `SessionExpiredModal.tsx` | 3 | Use new store |
| `LoginPage.tsx` / `RegisterPage.tsx` | 3, 5 | Handle new errors, flows |
| `VerifyEmailPage.tsx` | 5.4 | New page |
| `ResendVerificationPage.tsx` | 5.4 | New page |
| `app.ts` | 4, 10 | Rate limiters, CORS array |
| `email.service.ts` | 5 | Add verification email template |

---

## Testing Checklist

- [ ] Refresh token rotation works (old token invalidated after use)
- [ ] Logout revokes refresh token
- [ ] Logout everywhere revokes all tokens
- [ ] Access token not in localStorage
- [ ] Silent refresh works without race conditions
- [ ] Proactive refresh at 80% lifetime
- [ ] Per-endpoint rate limits enforced
- [ ] Email verification required before login
- [ ] Resend verification works
- [ ] Brute force lockout after 5 attempts
- [ ] Account auto-unlock after 15 min
- [ ] Concurrent session limit enforced (5)
- [ ] Device fingerprint logged on login/refresh
- [ ] Audit logs generated for all security events
- [ ] Config validation throws in production with fallback secrets
- [ ] CORS accepts multiple origins

---

## Rollout Order

1. **Phase 1-2** (Core + Rotation) - Critical security fixes
2. **Phase 3** (Client token storage) - XSS protection
3. **Phase 4** (Rate limiting) - DoS protection
4. **Phase 5** (Email verification) - Account security
5. **Phase 6-7** (Brute force + sessions) - Hardening
6. **Phase 8-10** (Fingerprinting, logging, config) - Observability

Each phase can be deployed independently with feature flags.