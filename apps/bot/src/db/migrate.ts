import { db, client } from "./";
// import dotenv from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";

// dotenv.config();

async function main() {
  console.log("Running migrations...");

  try {
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "./src/db/migrations"),
    });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Error during migration:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
