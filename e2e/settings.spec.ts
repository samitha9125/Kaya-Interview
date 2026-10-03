import { expect, test, type APIRequestContext } from "@playwright/test";
import { startAsGuest } from "./support";

// Nobody holds this NIC, so a working service answers 404 "no credit history".
const NIC = "199900000000";

// Asks the mock government service directly, from its own address, so the
// answer shows what the Settings controls did to it.
async function askBureau(request: APIRequestContext, ip: string) {
  const response = await request.post("/api/mock-gov/credit-score", {
    data: { nic: NIC },
    headers: { "x-forwarded-for": ip },
  });
  return response.status();
}

test("J4: a model is changed and today's government limit is reset from Settings", async ({
  page,
  request,
}) => {
  const ip = "192.0.2.60";
  await startAsGuest(page, 60);
  await page.getByRole("link", { name: "Settings" }).click();

  const loanModel = page.getByLabel("Loan", { exact: true });
  await loanModel.click();
  await page.getByLabel("Search models").fill("flash lite");
  await page.getByRole("option", { name: "Gemini 3.1 Flash Lite" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(loanModel).toHaveText("Gemini 3.1 Flash Lite");

  await Promise.all(Array.from({ length: 5 }, () => askBureau(request, ip)));
  expect(await askBureau(request, ip)).toBe(429);
  await page.getByRole("button", { name: "Reset limit" }).click();
  await expect(page.getByText("Today's government limit is reset.")).toBeVisible();
  expect(await askBureau(request, ip)).toBe(404);
});
