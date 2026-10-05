// ESLint 9 flat config — apps/server
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        fetch: "readonly",
        Response: "readonly",
        // Sibling fetch types, referenced by the connector transport helper
        Request: "readonly",
        RequestInit: "readonly",
        Headers: "readonly",
        AbortSignal: "readonly",
        Uint8Array: "readonly",
        __dirname: "readonly",
        // Used for Express Request augmentation (`declare global { namespace Express ... }`)
        Express: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Base rule conflicts with the TS variant — disable it
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Existing code has many `any` usages — warn to make them visible without blocking CI
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      // Global augmentation for Express Request (`declare global { namespace Express }`) is legitimate
      "@typescript-eslint/no-namespace": "off",
      // Legitimate swallowed errors are allowed when explicitly empty catch blocks
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      // docs/development-guide.md conventions, enforced at warn level so new
      // violations are visible without blocking CI. Existing large files are
      // baselined in the override below (measured 2026-09-27); shrink a file
      // below 300 lines and remove it from the baseline.
      "no-console": "warn",
      "max-lines": [
        "warn",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // Baseline: pre-existing files over the 300-line limit. max-lines is off
    // ONLY for these; every other server file is held to the guide's limit.
    files: [
      "src/services/auth.service.ts",
      "src/services/ingestion.service.ts",
      "src/services/email.service.ts",
      "src/services/ats-scoring.service.ts",
      "src/controllers/resume.controller.ts",
      "src/controllers/analytics.controller.ts",
      "src/controllers/search.controller.ts",
      "src/controllers/application.controller.ts",
      "src/controllers/auth.controller.ts",
    ],
    rules: {
      "max-lines": "off",
    },
  },
  {
    files: ["src/tests/**/*.ts", "src/**/__tests__/**/*.ts"],
    languageOptions: {
      globals: {
        // Tests stub/restore globals like fetch
        global: "writable",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Test output/debug logging is legitimate
      "no-console": "off",
    },
  },
];
