import { expect, test } from "@playwright/test";
import { fillByLabel, startAsGuest } from "./support";

// Generated details, not a real person. secret-scan:ignore
const APPLICANT = {
  "Full name": "Kasun Perera",
  "NIC number": "199512345678",
  "Date of birth": "1995-05-03",
  "Home address": "12 Temple Road, Kandy",
  "Mobile number": "071 234 5678",
};

test("J2: a guest opens an account, fixes a mistake, reviews and sends it", async ({ page }) => {
  await startAsGuest(page, 1);
  await page.getByRole("button", { name: "Open an account" }).click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await fillByLabel(page, { ...APPLICANT, "Mobile number": "12345" });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByLabel("Mobile number")).toHaveAccessibleDescription(
    "Please enter a Sri Lankan mobile number, such as 077 123 4567.",
  );
  await page.getByLabel("Mobile number").fill(APPLICANT["Mobile number"]);
  await page.getByLabel("Current").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Send your application" })).toBeVisible();
  await expect(page.getByText("0712345678")).toBeVisible();
  await expect(page.getByText("current", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send application" }).click();

  await expect(
    page.getByText("please visit any of our branches with your original NIC"),
  ).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled();
});

test("J2: leaving the form saves nothing and says so", async ({ page }) => {
  await startAsGuest(page, 2);
  await page.getByRole("button", { name: "Open an account" }).click();

  await page.getByRole("button", { name: "Not now" }).click();

  await expect(page.getByText("No problem, nothing has been saved.")).toBeVisible();
});
