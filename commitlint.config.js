module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow scopes like sprint-4 while keeping type enforcement strict
    "scope-case": [2, "always", ["lower-case", "kebab-case"]],
    "subject-case": [0],
  },
};
