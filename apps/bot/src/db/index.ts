import * as schema from "./schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CONFIG } from "../config";

export const client = postgres(CONFIG.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });

export * from './schema';