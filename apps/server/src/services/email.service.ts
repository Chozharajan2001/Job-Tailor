import nodemailer from "nodemailer";
import { config } from "../config/index.js";

let transporter: nodemailer.Transporter | null = null;

/**
 * Create and cache Nodemailer transporter.
 * Returns null if SMTP is not configured.
 */
function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = config.email;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure, // true for 465, false for 587/25
    auth: { user, pass },
    // Connection pool for better performance
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  // Verify connection on first use
  transporter
    .verify()
    .then((success) => {
      if (success) {
        console.log("✅ Email service: SMTP connection verified");
      }
    })
    .catch((err) => {
      console.warn("⚠️  Email service: SMTP verification failed:", err.message);
    });

  return transporter;
}

/**
 * Check if email service is configured.
 */
export function isEmailConfigured(): boolean {
  const { host, user, pass } = config.email;
  return !!(host && user && pass);
}

/**
 * Send a password reset email.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  expiresAt: Date,
): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    if (config.nodeEnv === "production") {
      // Never leak reset links into production logs; the API still returns a
      // generic success to prevent user enumeration.
      console.error(
        "❌ Email service: password reset email could not be sent — SMTP is not configured",
      );
      return;
    }
    // Dev fallback: log to console if no SMTP configured
    console.log("\n🔑 Password Reset Link (Email not configured):");
    console.log(`   ${resetUrl}`);
    console.log(`   Expires: ${expiresAt.toISOString()}\n`);
    return;
  }

  const { from, fromName, frontendUrl } = config.email;
  const expiryHours = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );

  const subject = "Reset your JobTailor password";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">JobTailor</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Smart resume & job application tracker</p>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td style="padding: 40px 32px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px; font-weight: 600;">Reset your password</h2>
        
        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          You requested a password reset for your JobTailor account. Click the button below to set a new password:
        </p>
        
        <!-- CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
          <tr>
            <td align="center">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        
        <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          Or copy and paste this link into your browser:<br>
          <span style="word-break: break-all; color: #4f46e5; font-family: monospace; font-size: 13px;">${resetUrl}</span>
        </p>
        
        <!-- Expiry Notice -->
        <div style="margin-top: 32px; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 500;">
            ⏰ This link expires in <strong>${expiryHours} hour${expiryHours !== 1 ? "s" : ""}</strong>.
          </p>
        </div>
        
        <!-- Security Note -->
        <div style="margin-top: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
            <strong>Security note:</strong> If you didn't request this password reset, please ignore this email. Your account security is important to us.
          </p>
        </div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px;">
          This email was sent by JobTailor
        </p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          <a href="${frontendUrl}" style="color: #4f46e5; text-decoration: none;">jobtailor.app</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `
Reset your JobTailor password

You requested a password reset for your JobTailor account.

Click this link to set a new password:
${resetUrl}

This link expires in ${expiryHours} hour${expiryHours !== 1 ? "s" : ""}.

Security note: If you didn't request this password reset, please ignore this email.

---
JobTailor
${frontendUrl}
`;

  const mailOptions = {
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    text: textBody,
    html: htmlBody,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${to}: ${info.messageId}`);
  } catch (error) {
    console.error(`❌ Failed to send password reset email to ${to}:`, error);
    // Don't throw - we don't want to reveal whether the email exists
    // The API will still return success to prevent user enumeration
  }
}

/**
 * Send an email verification email.
 */
export async function sendVerificationEmail(
  to: string,
  verificationUrl: string,
  expiresAt: Date,
): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    if (config.nodeEnv === "production") {
      // Never leak verification links into production logs
      console.error(
        "❌ Email service: verification email could not be sent — SMTP is not configured",
      );
      return;
    }
    // Dev fallback: log to console if no SMTP configured
    console.log("\n🔑 Email Verification Link (Email not configured):");
    console.log(`   ${verificationUrl}`);
    console.log(`   Expires: ${expiresAt.toISOString()}\n`);
    return;
  }

  const { from, fromName, frontendUrl } = config.email;
  const expiryHours = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );

  const subject = "Verify your JobTailor account";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">JobTailor</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Smart resume & job application tracker</p>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td style="padding: 40px 32px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 22px; font-weight: 600;">Welcome to JobTailor!</h2>
        
        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          Thanks for signing up! Please verify your email address to activate your account.
        </p>
        
        <!-- CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
          <tr>
            <td align="center">
              <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
                Verify Email Address
              </a>
            </td>
          </tr>
        </table>
        
        <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
          Or copy and paste this link into your browser:<br>
          <span style="word-break: break-all; color: #4f46e5; font-family: monospace; font-size: 13px;">${verificationUrl}</span>
        </p>
        
        <!-- Expiry Notice -->
        <div style="margin-top: 32px; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 500;">
            ⏰ This link expires in <strong>${expiryHours} hour${expiryHours !== 1 ? "s" : ""}</strong>.
          </p>
        </div>
        
        <!-- Security Note -->
        <div style="margin-top: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
            <strong>Security note:</strong> If you didn't create this account, please ignore this email.
          </p>
        </div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0 0 8px; color: #9ca3af; font-size: 12px;">
          This email was sent by JobTailor
        </p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          <a href="${frontendUrl}" style="color: #4f46e5; text-decoration: none;">jobtailor.app</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `
Welcome to JobTailor!

Thanks for signing up! Please verify your email address to activate your account.

Click this link to verify your email:
${verificationUrl}

This link expires in ${expiryHours} hour${expiryHours !== 1 ? "s" : ""}.

Security note: If you didn't create this account, please ignore this email.

---
JobTailor
${frontendUrl}
`;

  const mailOptions = {
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    text: textBody,
    html: htmlBody,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${to}: ${info.messageId}`);
  } catch (error) {
    console.error(`❌ Failed to send verification email to ${to}:`, error);
  }
}

/**
 * Verify SMTP connection on startup (optional).
 */
export async function verifyEmailConnection(): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.warn(
      "⚠️  Email service: Not configured (missing SMTP credentials)",
    );
    return false;
  }

  try {
    await transport.verify();
    return true;
  } catch (error) {
    console.error("❌ Email service: SMTP verification failed:", error);
    return false;
  }
}
