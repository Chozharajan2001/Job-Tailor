// ESLint 9 flat config — apps/client
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // TypeScript's compiler already catches undefined variables/types —
      // no-undef produces false positives on type-only globals (React, RequestInit, ...)
      "no-undef": "off",
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
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      // docs/development-guide.md conventions, enforced at warn level so new
      // violations are visible without blocking CI. Existing large pages are
      // baselined in the override below (measured 2026-09-27); shrink a file
      // below the limit and remove it from the baseline.
      "no-console": "warn",
      "max-lines": [
        "warn",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "warn",
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // Baseline: pre-existing pages over the 300-line limit. max-lines rules
    // are off ONLY for these; every other client file is held to the guide.
    files: [
      "src/pages/JobsPage.tsx",
      "src/pages/ProfilePage.tsx",
      "src/pages/TrackerPage.tsx",
      "src/pages/ResumeTailorPage.tsx",
      "src/pages/AnalyticsPage.tsx",
    ],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Test output/debug logging is legitimate
      "no-console": "off",
    },
  },
  {
    // Node-style configs (tailwind.config.ts uses require for plugins)
    files: ["*.config.ts", "*.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
