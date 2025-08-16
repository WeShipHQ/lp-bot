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
    ignores: ["dist/**", "node_modules/**", "**/*.test.ts", "**/*.spec.ts"],
  },
];