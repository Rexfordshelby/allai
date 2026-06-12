import { expect, test } from "@playwright/test";

test("shows setup or sign-in before the app workspace", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /manyai/i })
  ).toBeVisible();

  await expect(
    page
      .getByText(/setup required|send login link|chat with one model/i)
      .first()
  ).toBeVisible();
});
