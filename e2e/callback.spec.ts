import { expect, test } from "@playwright/test";
import { signIn } from "./support";

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
