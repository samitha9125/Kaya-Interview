import { expect, type Page } from "@playwright/test";

// Demo credentials from the README. secret-scan:ignore
export const DEMO_PASSWORD = "Demo@1234";

// Each customer signs in from their own address (TEST-NET-3), as real
// customers do. From one address the suite would trip the per-IP sign-in
// limit (FR-AUTH-07), which the rate limiter reads from X-Forwarded-For.
export async function signIn(page: Page, customerNumber: string, password = DEMO_PASSWORD) {
  const host = Number(customerNumber.replace(/\D/g, "")) % 250;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${host}` });
  await page.goto("/");
  await page.getByLabel("Customer number").fill(customerNumber);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// "I'm new": a guest session, from its own address like signIn's.
export async function startAsGuest(page: Page, host: number) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${host}` });
  await page.goto("/");
  await page.getByRole("button", { name: "I'm new" }).click();
  await expect(page.getByText("Hello. How can I help today?")).toBeVisible();
}

// "Check a loan", then the terms. The scripted model (TD25) asks for them
// first, then asks the bank for an assessment.
export async function askForLoan(page: Page, terms = "500,000 over 36 months") {
  await page.getByRole("button", { name: "Check a loan" }).click();
  await expect(page.getByText("How much would you like to borrow")).toBeVisible();
  await page.getByLabel("Message").fill(terms);
  await page.getByLabel("Message").press("Enter");
}

export async function stepUp(page: Page) {
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function consent(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Your consent for a credit check" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I agree" }).click();
}

// Fills each labelled field with its value.
export async function fillByLabel(page: Page, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await page.getByLabel(label).fill(value);
  }
}
