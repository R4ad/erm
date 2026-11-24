import { expect, expectAccessible, test } from "./fixtures";

test.describe("identification sources", () => {
  test("shows the response source and opens a coming-soon source", async ({ page }) => {
    await page.goto("/app/identification");
    await expect(page.getByRole("heading", { name: "شناسایی ریسک", level: 1 })).toBeVisible();
    const hero = page.getByRole("region", { name: "پاسخنامه‌ها" });
    await expect(hero.getByRole("link", { name: "بررسی پاسخنامه‌ها" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "نتایج پایش و نظارت" }).click();
    await expect(page).toHaveURL(/\/app\/identification\/sources\/monitoring$/);
    await expect(page.getByRole("heading", { name: "شناسایی ریسک از نتایج پایش و نظارت", level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "بازگشت به شناسایی ریسک" }).click();
    await expect(page).toHaveURL(/\/app\/identification$/);
  });
});
