import { expect, expectAccessible, test } from "./fixtures";

test.describe("risk questions", () => {
  test("answers a risk question and removes it from the list", async ({ page, api }) => {
    api.on("POST risk-questions/4/answer/", { message: "جواب ثبت شد." });
    await page.goto("/app/questionnaires/risk-questions");
    await expect(page.getByRole("heading", { name: "پرسش‌های ریسک", level: 1 })).toBeVisible();
    await expectAccessible(page);
    const list = page.getByRole("list", { name: "پرسش‌های باز" });
    await expect(list.getByRole("listitem")).toHaveCount(2);

    await list.getByRole("button", { name: "ثبت جواب" }).first().click();
    await expect(page.getByText("جواب را بنویسید.")).toBeVisible();
    await page.getByLabel("پرسش آزمون اول؟").fill("تیم پایش");
    // سرور آزمون بعد از جواب فقط پرسش دوم را برمی‌گرداند.
    api.on("GET risk-questions/", { questions: [] });
    await list.getByRole("button", { name: "ثبت جواب" }).first().click();
    await expect(page.getByText("جواب ثبت شد.").first()).toBeVisible();
    await expect(page.getByText("پرسش بازی منتظر جواب شما نیست")).toBeVisible();
  });
});
