import { expect, test } from "@playwright/test";
import { askForLoan, consent, signIn, stepUp } from "./support";

test("J1: eligible → confirm → the application is approved", async ({ page }) => {
  await signIn(page, "C1001");
  await askForLoan(page);
  await stepUp(page);
  await consent(page);

  await expect(
    page.getByText("Good news: you're eligible for LKR 500,000 over 36 months."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(
    page.getByText("Your application for LKR 500,000 over 36 months is approved."),
  ).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled();
});
