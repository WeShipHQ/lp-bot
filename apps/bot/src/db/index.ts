import * as schema from "./schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CONFIG } from "../config";

// Configure connection pooling
export const client = postgres(CONFIG.DATABASE_URL, {
  prepare: false,
  max: 20,              // max pool size
  idle_timeout: 20,     // seconds
  connect_timeout: 10,  // seconds
});
export const db = drizzle(client, { schema });

export * from './schema';