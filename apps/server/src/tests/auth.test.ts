import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.model.js';
import * as authService from '../services/auth.service.js';

process.env.NODE_ENV = 'test';
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_URI.replace(/\/job_tailor.*$/, '/job_tailor_auth_test');
} else {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/job_tailor_auth_test';
}

beforeAll(async () => {
  await connectDatabase();
  await User.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await disconnectDatabase();
});

describe('Authentication Service integration tests', () => {
  const testUserEmail = 'auth-integration-test@example.com';
  const testUserPassword = 'SecurePassword123!';

  it('should successfully register a new user and return verification token', async () => {
    const result = await authService.registerUser({
      email: testUserEmail,
      password: testUserPassword,
      firstName: 'Integration',
      lastName: 'Tester',
    });

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(testUserEmail);
    expect(result.verificationToken).toBeDefined();
    expect(result.verificationExpires).toBeDefined();

    // Verify user is in database
    const dbUser = await User.findOne({ email: testUserEmail }).lean();
    expect(dbUser).not.toBeNull();
    expect(dbUser!.firstName).toBe('Integration');
    expect(dbUser!.emailVerified).toBe(false);
    expect(dbUser!.emailVerificationToken).toBeDefined();
  });

  it('should prevent registration with a duplicate email address', async () => {
    await expect(
      authService.registerUser({
        email: testUserEmail,
        password: 'AnotherPassword999!',
        firstName: 'Dupe',
        lastName: 'Email',
      })
    ).rejects.toThrowError(/already exists/);
  });

  it('should verify email and then login successfully', async () => {
    // Register a new user specifically for this test
    const verifyEmail = 'verify-test@example.com';
    const registerResult = await authService.registerUser({
      email: verifyEmail,
      password: testUserPassword,
      firstName: 'Verify',
      lastName: 'Test',
    });

    // Use the plain verification token returned from registration
    await authService.verifyEmail(registerResult.verificationToken);

    // Now login should work
    const result = await authService.loginUser(verifyEmail, testUserPassword, 'test-agent', '127.0.0.1');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe(verifyEmail);

    // Verify user is now email verified
    const verifiedUser = await User.findOne({ email: verifyEmail }).lean();
    expect(verifiedUser!.emailVerified).toBe(true);
  });

  it('should throw an error when attempting to log in with an incorrect password', async () => {
    // Register and verify a user for this test
    const passwordTestEmail = 'password-test@example.com';
    const registerResult = await authService.registerUser({
      email: passwordTestEmail,
      password: testUserPassword,
      firstName: 'Password',
      lastName: 'Test',
    });
    await authService.verifyEmail(registerResult.verificationToken);

    // Now try incorrect password
    await expect(
      authService.loginUser(passwordTestEmail, 'IncorrectPassword!')
    ).rejects.toThrowError(/Invalid email or password/);
  });

  it('should successfully refresh access tokens using a valid refresh token', async () => {
    // Register and verify a user for this test
    const refreshTestEmail = 'refresh-test@example.com';
    const registerResult = await authService.registerUser({
      email: refreshTestEmail,
      password: testUserPassword,
      firstName: 'Refresh',
      lastName: 'Test',
    });
    await authService.verifyEmail(registerResult.verificationToken);

    // 1. Log in to get a valid refresh token
    const loginResult = await authService.loginUser(refreshTestEmail, testUserPassword, 'test-agent', '127.0.0.1');
    expect(loginResult.refreshToken).toBeDefined();

    // 2. Perform refresh
    const refreshResult = await authService.refreshTokenService(loginResult.refreshToken, 'test-agent', '127.0.0.1');
    expect(refreshResult.accessToken).toBeDefined();
    expect(refreshResult.refreshToken).toBeDefined();
  });

  it('should reject silent refresh operations using malformed refresh tokens', async () => {
    await expect(
      authService.refreshTokenService('malformed_jwt_token_stub')
    ).rejects.toThrowError(/Invalid or expired refresh token/);
  });

  it('should enforce email verification before login', async () => {
    // Create a new unverified user
    const newEmail = 'unverified-test@example.com';
    await authService.registerUser({
      email: newEmail,
      password: testUserPassword,
      firstName: 'Unverified',
      lastName: 'User',
    });

    // Attempt to login without verification should fail
    await expect(
      authService.loginUser(newEmail, testUserPassword, 'test-agent', '127.0.0.1')
    ).rejects.toThrowError(/Please verify your email/);
  });

  it('should throw EMAIL_NOT_VERIFIED error for unverified users', async () => {
    const newEmail = 'unverified-test2@example.com';
    await authService.registerUser({
      email: newEmail,
      password: testUserPassword,
      firstName: 'Unverified',
      lastName: 'User2',
    });

    await expect(
      authService.loginUser(newEmail, testUserPassword, 'test-agent', '127.0.0.1')
    ).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });
});