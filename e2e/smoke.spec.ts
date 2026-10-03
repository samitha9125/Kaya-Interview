import { expect, test } from "@playwright/test";

test("FR-WEB-06: the home page loads with the security headers", async ({ page }) => {
  const response = await page.goto("/");

  const headers = response?.headers() ?? {};
  expect(response?.ok()).toBe(true);
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
