import { defineConfig, devices } from "@playwright/test";

// Its own port and database, so a test run never touches the dev data.
const PORT = 3100;
const DATABASE_PATH = ".e2e.db";
const isCI = !!process.env.CI;
// The app refuses to start without an encryption key (P0-16). Tests use a
// fixed, obviously fake one.
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A fresh database each run. CI tests the production build; locally the
    // dev server is faster.
    command: `rm -f ${DATABASE_PATH}* && pnpm db:setup && ${isCI ? "pnpm start" : "pnpm dev"} --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      DATABASE_PATH,
      DEMO_MODE: "true",
      GOV_API_BASE_URL: `http://localhost:${PORT}/api/mock-gov`,
    },
  },
});
