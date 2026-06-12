import { expect, test } from "@playwright/test";

test("opens directly into the app workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Luma AI", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chat" }).first()).toBeVisible();
  await expect(page.getByLabel("Chat model")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Images" }).first()).toBeVisible();
  await expect(
    page.getByText("Ask any model from one place")
  ).toBeVisible();
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible();

  await page.getByRole("button", { name: "Compare" }).first().click();
  await expect(page.getByText("Models", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Send one prompt to every selected model...")).toBeVisible();

  await page.getByRole("button", { name: "Images" }).first().click();
  await expect(page.getByLabel("Image model")).toBeVisible();
  await expect(page.getByPlaceholder("Describe the image...")).toBeVisible();
});
