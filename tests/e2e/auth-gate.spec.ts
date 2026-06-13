import { expect, test } from "@playwright/test";

test("opens directly into the app workspace", async ({ page }) => {
  await page.goto("/");
  const modeSwitcher = page.getByRole("tablist", { name: "Mode switcher" });

  await expect(page.getByText("Luma AI", { exact: true })).toBeVisible();
  await expect(
    modeSwitcher.getByRole("button", { name: "Chat" })
  ).toBeVisible();
  await expect(page.getByLabel("Chat model")).toBeVisible();
  await expect(
    modeSwitcher.getByRole("button", { name: "Compare" })
  ).toBeVisible();
  await expect(
    modeSwitcher.getByRole("button", { name: "Images" })
  ).toBeVisible();
  await expect(
    page.getByText("Ask any model from one place")
  ).toBeVisible();
  await expect(page.getByPlaceholder("Ask anything...")).toBeVisible();

  await modeSwitcher.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByText("Models", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Send one prompt to every selected model...")).toBeVisible();

  await modeSwitcher.getByRole("button", { name: "Images" }).click();
  await expect(page.getByLabel("Image model")).toBeVisible();
  await expect(page.getByPlaceholder("Describe the image...")).toBeVisible();
});
