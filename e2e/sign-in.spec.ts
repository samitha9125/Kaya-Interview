import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, signIn } from "./support";

test("FR-AUTH-01: a customer signs in and sees their name", async ({ page }) => {
  await signIn(page, "C1009");

  await expect(page.getByText("Hello Tharindu Herath. How can I help today?")).toBeVisible();
});

test("FR-AUTH-02: the session cookie is __Host-, HttpOnly, Secure and SameSite=Strict", async ({
  page,
  context,
}) => {
  await signIn(page, "C1010");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const [cookie] = await context.cookies();

  expect(cookie).toMatchObject({
    name: "__Host-session",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
  });
});

test("FR-AUTH-01: a wrong password shows the one sign-in failure message", async ({ page }) => {
  await signIn(page, "C1008", "not the password");

  // Next.js has its own route-announcer alert, so ours is picked by text.
  await expect(page.getByRole("alert").filter({ hasText: "sign you in" })).toHaveText(
    "We couldn't sign you in with those details. After 5 tries in a row, sign-in pauses for 15 minutes.",
  );
});

test("FR-AUTH-04: after sign-out, a copied session cookie no longer works", async ({
  page,
  context,
  browser,
}) => {
  await signIn(page, "C1001");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const copied = await context.cookies();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  const thief = await browser.newContext();
  await thief.addCookies(copied);
  const stolenPage = await thief.newPage();
  await stolenPage.goto("/");
  await expect(stolenPage.getByRole("button", { name: "Sign in" })).toBeVisible();
  await thief.close();
});

test('FR-AUTH-05: "I\'m new" opens the chat as a guest', async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "I'm new" }).click();

  await expect(page.getByText("Hello. How can I help today?")).toBeVisible();
});

test("FR-WEB-01: a sign-in posted from another site is refused with 403", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    headers: { origin: "https://evil.example" },
    data: { customerNumber: "C1001", password: DEMO_PASSWORD, idempotencyKey: crypto.randomUUID() },
  });

  expect(response.status()).toBe(403);
});
