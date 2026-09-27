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
      // Controllers and routes joined 2026-09-27 (better-harness review): the
      // highest-churn core paths must be inside the measured surface, not just
      // the services layer. Thresholds may only be adjusted with a recorded
      // measurement in hand (see ci.yml coverage-floor comment).
      include: [
        "src/services/**",
        "src/middleware/**",
        "src/utils/**",
        "src/controllers/**",
        "src/routes/**",
      ],
      exclude: ["src/services/email.service.ts", "**/__tests__/**"],
      // Floors set from the 2026-09-27 measurement of THIS widened surface:
      // stmts 55.59 / branch 68.72 / funcs 59.37 / lines 55.59 (controllers at
      // 22.99 stmts are the diluter; services-only surface measured 68.68/
      // 71.3/75.64/68.68 the same day). Raise a floor only when a later
      // measurement supports it; never lower one without a recorded number.
      thresholds: {
        lines: 55,
        functions: 59,
        branches: 50,
        statements: 55,
      },
    },
  },
});
