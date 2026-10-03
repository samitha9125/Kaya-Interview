import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { startAsGuest } from "./support";

// Nobody holds this NIC, so a working service answers 404 "no credit history".
const NIC = "199900000000";

// Asks the mock government service directly, from its own address, so the
// answer shows what the Settings controls did to it.
async function askBureau(request: APIRequestContext, ip: string) {
  const started = Date.now();
  const response = await request.post("/api/mock-gov/credit-score", {
    data: { nic: NIC },
    headers: { "x-forwarded-for": ip },
  });
  return { status: response.status(), elapsedMs: Date.now() - started };
}

async function setMode(page: Page, mode: string, name: string) {
  await page.getByLabel("Government service behaviour").selectOption(mode);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(`The government service is now: ${name}.`)).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("J4: a model is changed and today's government limit is reset from Settings", async ({
  page,
  request,
}) => {
  const ip = "192.0.2.60";
  await startAsGuest(page, 60);
  await page.getByRole("link", { name: "Settings" }).click();

  await page.getByLabel("Loan model", { exact: true }).selectOption("google/gemini-3.1-flash-lite");
  await page.getByRole("button", { name: "Save the loan model" }).click();
  await expect(page.getByText("Saved. New conversations use it.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Loan model", { exact: true })).toHaveValue(
    "google/gemini-3.1-flash-lite",
  );

  await Promise.all(Array.from({ length: 5 }, () => askBureau(request, ip)));
  expect((await askBureau(request, ip)).status).toBe(429);
  await page.getByRole("button", { name: "Reset today's government limit" }).click();
  await expect(page.getByText("Today's government limit is reset.")).toBeVisible();
  expect((await askBureau(request, ip)).status).toBe(404);
});

test("FR-SET-05: each failure mode set from Settings changes how the government service answers", async ({
  page,
  request,
}) => {
  const ip = "192.0.2.61";
  await page.goto("/settings");

  await setMode(page, "slow", "Slow (answers after our 5-second timeout)");
  const slow = await askBureau(request, ip);
  expect(slow.status).toBe(404);
  expect(slow.elapsedMs).toBeGreaterThan(5_000);
  await setMode(page, "error", "Error (500)");
  expect((await askBureau(request, ip)).status).toBe(500);
  await setMode(page, "rate_limited", "Rate limited (429, retry in an hour)");
  expect((await askBureau(request, ip)).status).toBe(429);
  await setMode(page, "down", "Down (503)");
  expect((await askBureau(request, ip)).status).toBe(503);
  await setMode(page, "normal", "Normal");
  expect((await askBureau(request, ip)).status).toBe(404);
});
