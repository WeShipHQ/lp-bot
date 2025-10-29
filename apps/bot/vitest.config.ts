import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/services/flows/**/*.ts", "src/infrastructure/jobs/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.test.ts", "**/*.spec.ts"],
    },
    globals: true,
    environmentOptions: {
      env: {
        NODE_ENV: "test",
        PORT: "3201",
      },
    },
    setupFiles: ["src/services/flows/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
