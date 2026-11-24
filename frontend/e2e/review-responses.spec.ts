import { expect, expectAccessible, test } from "./fixtures";

test.describe("review responses", () => {
  test("shows the review queue and filters the table", async ({ page, api }) => {
    await page.goto("/app/identification/responses");
    await expect(page.getByRole("heading", { name: "بررسی پاسخنامه‌ها", level: 1 })).toBeVisible();
    const queue = page.getByRole("region", { name: "در انتظار بررسی" });
    await expect(queue.getByRole("listitem")).toHaveCount(4);
    await expect(page.getByRole("table", { name: "همه‌ی پاسخنامه‌ها" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("tab", { name: /بازگشت برای تکمیل/ }).click();
    await expect(page).toHaveURL(/\?status=returned$/);
    await expect.poll(() => api.callsTo("GET questionnaire-responses/").at(-1)?.query.get("status")).toBe("returned");
  });
});
