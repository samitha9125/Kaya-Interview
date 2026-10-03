import { defineConfig } from "drizzle-kit";
import { DEFAULT_DATABASE_PATH, MIGRATIONS_FOLDER } from "./src/server/platform/db/config";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/**/schema.ts",
  out: `./${MIGRATIONS_FOLDER}`,
  dbCredentials: { url: DEFAULT_DATABASE_PATH },
});
