import { ConfigError, getConfig } from "@/server/platform/config";
import { DEFAULT_DATABASE_PATH, openDatabase } from "@/server/platform/db";
import { seedDemoCustomers } from "./demo-customers";

// Run by `pnpm db:setup` after the migrations.
async function main() {
  const { APP_ENCRYPTION_KEY } = getConfig();
  const { db, sqlite } = openDatabase(DEFAULT_DATABASE_PATH);
  await seedDemoCustomers(db, APP_ENCRYPTION_KEY);
  sqlite.close();
  console.log("Seeded the demo customers.");
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
