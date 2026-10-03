import { expect, test } from "@playwright/test";
import { signIn } from "./support";

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
