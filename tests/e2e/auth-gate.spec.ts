import { expect, test } from "@playwright/test";

test("opens directly into the app workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Luma", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Chat" })).toBeVisible();
  await expect(
    page.getByText("Q2 Marketing Strategy Overview")
  ).toBeVisible();
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible();
});
