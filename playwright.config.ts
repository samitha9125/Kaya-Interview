import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
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
    // CI tests the production build; locally the dev server is faster.
    command: isCI ? `pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: { APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY },
  },
});
