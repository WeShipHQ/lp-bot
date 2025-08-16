import { defineConfig } from "drizzle-kit";
import { CONFIG } from "./src/config";

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: CONFIG.DATABASE_URL,
  },
});
