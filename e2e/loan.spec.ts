import { expect, test } from "@playwright/test";
import { askForLoan, consent, signIn, stepUp } from "./support";

// The government budget is 5 calls a day for the whole app, so these run
// in order and the one that blocks the bureau runs last.
test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/api/mock-gov/admin/failure-mode", { data: { mode: "normal" } });
});

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

test("J1: not eligible ends the journey with the reason and a next step", async ({ page }) => {
  await signIn(page, "C1002");
  await askForLoan(page);
  await stepUp(page);
  await consent(page);

  await expect(
    page.getByText("I'm sorry, based on your credit record, we can't offer this loan right now."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit application" })).toHaveCount(0);
});

test("J1: a case below the confidence threshold is referred to a loan officer", async ({
  page,
}) => {
  await signIn(page, "C1003");
  await askForLoan(page);
  await stepUp(page);
  await consent(page);

  await expect(page.getByText("needs a quick look from one of our loan officers")).toBeVisible();
});

test("P1-15: input is locked while a turn runs and while a card waits", async ({ page }) => {
  await signIn(page, "C1009");
  let releaseTurn = () => {};
  const held = new Promise<void>((resolve) => (releaseTurn = resolve));
  await page.route("/api/chat", async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole("button", { name: "Check a loan" }).click();
  await expect(page.getByRole("status")).toHaveText("The assistant is typing…");
  await expect(page.getByLabel("Message")).toBeDisabled();
  releaseTurn();
  await expect(page.getByText("How much would you like to borrow")).toBeVisible();
  await page.getByLabel("Message").fill("1,000,000 over 36 months");
  await page.getByLabel("Message").press("Enter");

  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
  await expect(page.getByLabel("Message")).toBeDisabled();
});

test("P1-11: a reload brings the conversation back, card included", async ({ page }) => {
  await signIn(page, "C1008");
  await askForLoan(page, "2,000,000 over 60 months");
  await stepUp(page);
  await expect(
    page.getByRole("heading", { name: "Your consent for a credit check" }),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByText("2,000,000 over 60 months").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your consent for a credit check" }),
  ).toBeVisible();
  await expect(page.getByLabel("Message")).toBeDisabled();
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByText("No problem, I haven't checked anything.")).toBeVisible();
});

test("FR-WEB-07: the loan journey works by keyboard alone, with labelled inputs", async ({
  page,
}) => {
  await signIn(page, "C1010");
  await page.getByRole("button", { name: "Check a loan" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("How much would you like to borrow")).toBeVisible();
  await page.getByLabel("Message").focus();
  await page.keyboard.type("500,000 over 36 months");
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.type("Demo@1234"); // secret-scan:ignore
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "I agree" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.getByText("No problem, I haven't checked anything.")).toBeVisible();
});

test("J1: when the bureau can't be reached, the customer hears it plainly and gets a next step", async ({
  page,
}) => {
  await page.request.post("/api/mock-gov/admin/failure-mode", { data: { mode: "rate_limited" } });
  await signIn(page, "C1007");
  await askForLoan(page);
  await stepUp(page);
  await consent(page);

  await expect(page.getByText("I can't run the credit check right now.")).toBeVisible();
});
