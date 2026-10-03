import { defineConfig, devices } from "@playwright/test";

// Its own port and database, so a test run never touches the dev data.
const PORT = 3100;
const DATABASE_PATH = ".e2e.db";
const isCI = !!process.env.CI;
// The app refuses to start without an encryption key (P0-16). Tests use a
// fixed, obviously fake one.
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");

// BR-SET-01, P0-15 need a server with demo mode off. Two dev servers can't
// share this directory, so that one serves the production build (built
// first, except in CI, where the build already exists). It has no model
// key; the specs that use it never start a conversation.
const DEMO_OFF_PORT = 3101;

const serve = (port: number, databasePath: string, run: string) =>
  `rm -f ${databasePath}* && pnpm db:setup && ${run} --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: ["settings.spec.ts", "demo-off.spec.ts"],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
    },
    // The demo controls change the mock and the budget every journey uses,
    // so J4 runs once the journeys are done.
    {
      name: "settings",
      testMatch: "settings.spec.ts",
      dependencies: ["chromium"],
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "demo-off",
      testMatch: "demo-off.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${DEMO_OFF_PORT}` },
    },
  ],
  webServer: [
    {
      // A fresh database each run. CI tests the production build; locally
      // the dev server is faster.
      command: serve(PORT, DATABASE_PATH, isCI ? "pnpm start" : "pnpm dev"),
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
        DATABASE_PATH,
        DEMO_MODE: "true",
        // No model key in tests: the specialists are rule-played (TD25, TD27).
        E2E_SCRIPTED_MODEL: "1",
      },
    },
    {
      command: serve(
        DEMO_OFF_PORT,
        ".e2e-demo-off.db",
        isCI ? "pnpm start" : "pnpm build && pnpm start",
      ),
      url: `http://localhost:${DEMO_OFF_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 240_000,
      env: {
        APP_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
        DATABASE_PATH: ".e2e-demo-off.db",
        DEMO_MODE: "false",
      },
    },
  ],
});
