import type { Page } from "@playwright/test";

import { expect, expectAccessible, test } from "./fixtures";

// مدیریت سامانه در مرورگر واقعی، زیر CSP و Trusted Types واقعی، در دسکتاپ و موبایل و هر دو تم: کاربران، تعطیلات،
// سوابق ممیزی و ورود کارکنان با گزارش آزمایشی و تأیید.

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("system administration", () => {
  test("lists users and holidays, and deletes a holiday after asking", async ({ page, api }) => {
    await page.goto("/app/accounts/users");
    await expect(page.getByRole("heading", { name: "تعریف کاربر و نقش", level: 1 })).toBeVisible();
    await expect(page.getByRole("table", { name: "کاربران سامانه" })).toContainText("سارا محمدی");
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.goto("/app/holidays");
    await expect(page.getByRole("heading", { name: "تعطیلات", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
    await page.getByRole("button", { name: "حذف تعطیلی آزمون یکم" }).click();
    const dialog = page.getByRole("alertdialog", { name: /تعطیلی آزمون یکم/ });
    await expect(dialog).toBeVisible();
    await expectAccessible(page);
    await dialog.getByRole("button", { name: "حذف تعطیلی" }).click();
    await expect(page.getByText("تعطیلی «تعطیلی آزمون یکم» حذف شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/holidays/1/delete/");

    await page.getByRole("link", { name: "تعطیلی تازه" }).click();
    await expect(page).toHaveURL(/\/app\/holidays\/new$/);
    await expect(page.getByRole("textbox", { name: /تاریخ/ })).toBeVisible();
    await expectAccessible(page);
  });

  test("moves between the audit tabs and keeps the filters in the Excel export", async ({ page }) => {
    await page.goto("/app/audit?event=login_failed");
    await expect(page.getByRole("heading", { name: "سوابق ممیزی", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "خروجی Excel" })).toHaveAttribute(
      "href",
      "/audit/export/?event=login_failed",
    );
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("link", { name: "تغییرات داده" }).click();
    await expect(page).toHaveURL(/\/app\/audit\/changes$/);
    await expect(page.getByRole("link", { name: "تغییرات داده" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("table", { name: /تغییرات داده/ })).toContainText("عنوان تازه‌ی آزمون");
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
  });

  test("imports staff in two steps: a dry run, then confirm", async ({ page, api }) => {
    await page.goto("/app/accounts/staff-import");
    await expect(page.getByRole("heading", { name: "ورود کارکنان از فایل منابع انسانی", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page
      .getByLabel(/^فایل Excel منابع انسانی/)
      .setInputFiles({ name: "staff.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("PK") });
    await page.getByRole("button", { name: "بارگذاری و گزارش آزمایشی" }).click();
    await expect(page.getByText("اجرای آزمایشی: هنوز چیزی ذخیره نشده است.")).toBeVisible();
    await expect(page.getByText("گزارش آزمایشی", { exact: true })).toBeFocused();
    await expect(page.getByText("ردیف ۴: کد پرسنلی خالی است.")).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("button", { name: "تأیید و ذخیره" }).click();
    await expect(page.getByText("گزارش آن‌چه انجام شد", { exact: true })).toBeVisible();
    const [, confirm] = api.callsTo("POST forms/");
    expect(confirm!.query.get("path")).toBe("/accounts/staff-import/confirm/");
    await expectAccessible(page);
  });
});
