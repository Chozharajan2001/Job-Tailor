import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 60000, // in-memory Mongo first-run download can be slow
    teardownTimeout: 10000,
    // Each file spins up its own in-memory MongoDB — run them sequentially
    // to keep resource usage predictable locally and in CI.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // Test-only secrets (never reuse real values here)
      JWT_SECRET: "vitest-only-secret-000000000000000000000000000000000000",
      JWT_REFRESH_SECRET: "vitest-only-refresh-secret-000000000000000000000000",
      // Satisfies validateConfig() when app.ts is imported by supertest;
      // tests always connect their own in-memory database instead.
      MONGODB_URI: "mongodb://127.0.0.1:27017/job_tailor_vitest",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/services/**", "src/middleware/**", "src/utils/**"],
      exclude: ["src/services/email.service.ts", "**/__tests__/**"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
