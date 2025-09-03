import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    globals: true,
    environmentOptions: {
      env: {
        NODE_ENV: "test",
        PORT: "3201",
      },
    },
  },
});
