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

  it('should successfully register a new user and generate tokens', async () => {
    const result = await authService.registerUser({
      email: testUserEmail,
      password: testUserPassword,
      firstName: 'Integration',
      lastName: 'Tester',
    });

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(testUserEmail);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();

    // Verify user is in database
    const dbUser = await User.findOne({ email: testUserEmail }).lean();
    expect(dbUser).not.toBeNull();
    expect(dbUser!.firstName).toBe('Integration');
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

  it('should successfully log in an existing user with correct credentials', async () => {
    const result = await authService.loginUser(testUserEmail, testUserPassword);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe(testUserEmail);
  });

  it('should throw an error when attempting to log in with an incorrect password', async () => {
    await expect(
      authService.loginUser(testUserEmail, 'IncorrectPassword!')
    ).rejects.toThrowError(/Invalid email or password/);
  });

  it('should successfully refresh access tokens using a valid refresh token', async () => {
    // 1. Log in to get a valid refresh token
    const loginResult = await authService.loginUser(testUserEmail, testUserPassword);
    expect(loginResult.refreshToken).toBeDefined();

    // 2. Perform refresh
    const refreshResult = await authService.refreshTokenService(loginResult.refreshToken);
    expect(refreshResult.accessToken).toBeDefined();
    expect(refreshResult.refreshToken).toBeDefined();
  });

  it('should reject silent refresh operations using malformed refresh tokens', async () => {
    await expect(
      authService.refreshTokenService('malformed_jwt_token_stub')
    ).rejects.toThrowError(/Invalid or expired refresh token/);
  });
});
