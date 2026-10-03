import { expect, test } from "@playwright/test";
import { fillByLabel, signIn, startAsGuest } from "./support";

test("J3: a signed-in customer asks for a call and it's recorded from their record", async ({
  page,
}) => {
  await signIn(page, "C1006");

  await page.getByRole("button", { name: "Talk to a person" }).click();

  await expect(
    page.getByText("I've asked our team to call you on the number we have for you."),
  ).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled();
});

test("J3: a guest leaves a name and number for a call", async ({ page }) => {
  await startAsGuest(page, 3);
  await page.getByRole("button", { name: "Talk to a person" }).click();
  await expect(page.getByRole("heading", { name: "Ask for a call" })).toBeVisible();

  await fillByLabel(page, { "Your name": "Kasun Perera", "Mobile number": "077 123 4567" });
  await page.getByRole("button", { name: "Ask for a call" }).click();

  await expect(
    page.getByText("I've asked our team to call you on the number you gave."),
  ).toBeVisible();
});

test("FR-AGT-01: a message with no journey meets triage, and anything else gets the redirect", async ({
  page,
}) => {
  await startAsGuest(page, 4);

  await page.getByLabel("Message").fill("Hello there");
  await page.getByLabel("Message").press("Enter");

  await expect(page.getByText("I can help you check a loan or open an account")).toBeVisible();
});
