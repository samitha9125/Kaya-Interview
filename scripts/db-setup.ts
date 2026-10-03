import { ConfigError, getConfig } from "@/server/platform/config";
import { migrateDatabase, openDatabase } from "@/server/platform/db";
import { seedDemoCustomers } from "./demo-customers";
import { seedDemoCitizens, seedOpenApplication } from "./demo-lending";

// `pnpm db:setup`: migrate, then add the demo data. One script, so both
// steps use the same configured database file.
async function main() {
  const config = getConfig();
  const { APP_ENCRYPTION_KEY, DATABASE_PATH } = config;
  const { db, sqlite } = openDatabase(DATABASE_PATH);
  migrateDatabase(db);
  await seedDemoCustomers(db, APP_ENCRYPTION_KEY);
  seedDemoCitizens(db);
  await seedOpenApplication(db, config);
  sqlite.close();
  console.log(
    `Database ready: ${DATABASE_PATH}, with the demo customers and their credit records.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
