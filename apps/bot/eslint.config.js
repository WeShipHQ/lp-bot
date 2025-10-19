import { config } from "@weship/eslint-config";

export default [
  ...config,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Loosen some TS rules for the bot while we iterate on types
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      // Unused vars are common during iterative refactors in this package
      // Turn off to avoid noise; consider re-enabling once the code stabilizes
      "@typescript-eslint/no-unused-vars": "off",
      // Some optional chains use non-null assertions intentionally in this codebase
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      // turbo rule is noisy for bots that load env at runtime
      "turbo/no-undeclared-env-vars": "off",
      // Prefer-const causes lots of noise for mutable patterns in this codebase
      "prefer-const": "off",
      // Allow intentionally empty catch blocks in utility code
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "**/*.test.ts", "**/*.spec.ts"],
  },
];