# Real Email Implementation Plan for Forgot Password

## Overview
Replace console-logged reset links with actual transactional emails using **Nodemailer** with configurable SMTP. This is the most flexible approach - works with Gmail, Outlook, SendGrid SMTP, Mailgun SMTP, custom SMTP servers, etc.

---

## Files to Modify (6) + Files to Create (2)

### 1. `apps/server/package.json` — Add dependencies
```json
"nodemailer": "^6.9.15",
"@types/nodemailer": "^6.4.16"
```

### 2. `apps/server/src/config/index.ts` — Add email config
```typescript
email: {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.EMAIL_FROM || 'noreply@jobtailor.app',
  fromName: process.env.EMAIL_FROM_NAME || 'JobTailor',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
},
```

### 3. `apps/server/src/services/email.service.ts` — **NEW FILE**
Email service with:
- `createTransport()` — Nodemailer transport factory
- `sendPasswordResetEmail(to, resetUrl, expiresAt)` — Sends HTML + text reset email
- `verifyConnection()` — Test SMTP on startup (optional)
- Template with JobTailor branding, reset link, expiry notice

### 4. `apps/server/src/services/auth.service.ts` — Update `requestPasswordReset`
- Import `emailService`
- Replace `console.log` with `await emailService.sendPasswordResetEmail(email, resetUrl, expiresAt)`
- Keep silent-return for non-existent users (prevent enumeration)
- Log errors but don't throw (keep UX consistent)

### 5. `apps/server/src/controllers/auth.controller.ts` — Update response message
Change from "logged to server console" → "sent to your email"

### 6. `apps/client/src/pages/ForgotPasswordPage.tsx` — Update success message
Change from "Check the Server Console" → "Check your email"

### 7. Root `.env.example` — Add email config template
```bash
# Email (SMTP) — REQUIRED for production password reset
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Gmail App Password, not regular password
EMAIL_FROM=noreply@jobtailor.app
EMAIL_FROM_NAME=JobTailor
FRONTEND_URL=http://localhost:5173
```

### 8. `apps/server/.env` (local) — Add same vars for dev testing

---

## Email Template Design

**Subject**: `Reset your JobTailor password`

**HTML Body**:
- JobTailor logo/branding
- "You requested a password reset"
- Big CTA button: "Reset Password" → links to `${frontendUrl}/reset-password/${token}`
- Expiry notice: "This link expires in 1 hour"
- Security note: "If you didn't request this, ignore this email"

**Text Body**: Plain text fallback with same info

---

## Behavior Details

| Scenario | Current | New |
|----------|---------|-----|
| User exists | Log URL to console | Send email + log success |
| User doesn't exist | Silent return | Silent return (no email) |
| Email send fails | N/A | Log error, still return 200 (security) |
| Dev without SMTP | Console log | Console log + warning "Email not configured" |

---

## Testing Checklist

1. **Install deps**: `cd apps/server && npm install nodemailer @types/nodemailer`
2. **Add SMTP to .env**: Test with Gmail App Password or Ethereal.email (fake SMTP for dev)
3. **Run server**: Should show "Email service initialized" or "⚠️ Email not configured"
4. **Test flow**: 
   - Go to `/forgot-password` → enter email → submit
   - Check email inbox for reset link
   - Click link → `/reset-password/:token` → set new password
   - Login with new password
5. **Verify security**: Try non-existent email → same success message, no email sent

---

## Rollback Plan
- If email fails in production: feature flag `ENABLE_EMAIL_RESET=false` falls back to console logging
- Keep `requestPasswordReset` signature unchanged — only internal implementation changes