import { expect, test } from "@playwright/test";

// Every route that changes settings or the demo, ours and the mock's; and
// the demo panel's one read.
const DEMO_ROUTES = [
  "/api/settings/model",
  "/api/demo/reset-limit",
  "/api/demo/clear-cache",
  "/api/demo/age-cache",
  "/api/demo/failure-mode",
  "/api/demo/reset-my-data",
  "/api/mock-gov/admin/reset",
  "/api/mock-gov/admin/failure-mode",
];

test("P0-15: with DEMO_MODE=false every settings and demo route answers 404", async ({
  request,
}) => {
  const statuses = await Promise.all(
    DEMO_ROUTES.map(async (route) => (await request.post(route, { data: {} })).status()),
  );

  expect(statuses).toEqual(DEMO_ROUTES.map(() => 404));
  expect((await request.get("/api/demo/inspector")).status()).toBe(404);
});
