// ESLint 9 flat config — apps/extension
// Mirrors the apps/server pattern. src/ runs in browser/extension contexts:
// browser globals only (plus `chrome`); NO Node globals, so accidental
// `process`/`require`/`Buffer` usage in content/popup/background code is a
// lint error. Node globals are scoped to tests and build configs only.
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
  {
    // Tests run under Node with a DOM environment (happy-dom) and stub
    // `globalThis.chrome`; configs are Node scripts.
    files: ["tests/**/*.ts", "*.config.ts", "*.config.mjs"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        chrome: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
