import type { Page } from "@playwright/test";

import { expect, expectAccessible, test } from "./fixtures";

// کاتالوگ، ساختار سازمانی و روش ارزیابی در مرورگر واقعی، زیر CSP و Trusted Types واقعی، در دسکتاپ و موبایل و هر دو
// تم. رنگ سطح‌های ریسک از روش ارزیابی با style خود React (CSSOM) می‌آید و نباید هیچ تخلف CSP بسازد.

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("service catalog", () => {
  test("goes from the services to a service and adds a supplier dependency through the Django form", async ({
    page,
    api,
  }) => {
    await page.goto("/app/catalog/services");
    await expect(page.getByRole("heading", { name: "خدمات و فرایندها", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("link", { name: "درگاه پرداخت اینترنتی" }).click();
    await expect(page).toHaveURL(/\/app\/catalog\/services\/1$/);
    await expect(page.getByRole("heading", { name: "درگاه پرداخت اینترنتی", level: 1 })).toBeVisible();
    const banks = page.getByRole("table", { name: /بانک‌های این خدمت/ });
    await expect(banks.getByRole("row", { name: /بانک ملی/ })).toContainText("۴ ساعت");
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("button", { name: "افزودن وابستگی" }).click();
    await page.getByRole("menuitem", { name: "به تأمین‌کننده" }).click();
    await expect(page).toHaveURL(/\/app\/catalog\/services\/1\/dependencies\/new\/supplier$/);
    await expect(page.getByRole("heading", { name: /وابستگی خدمت SRV-PAY/, level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("combobox", { name: /^تأمین‌کننده/ }).selectOption("2");
    await page.getByRole("combobox", { name: /مالک زیرساخت/ }).selectOption("supplier");
    await page.getByRole("button", { name: "ذخیره" }).click();
    await expect(
      page.getByText("وابستگی خدمت «درگاه پرداخت اینترنتی» به «شرکت پشتیبانی سخت‌افزار» ذخیره شد.", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/app\/catalog\/services\/1$/);
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/catalog/services/1/dependencies/new/supplier/");
    expect((call!.body as { values: Record<string, unknown> }).values).toMatchObject({
      supplier: "2",
      infra_owner: "supplier",
    });
  });

  test("opens a supplier from a dependency and lists the other catalogue pages", async ({ page }) => {
    await page.goto("/app/catalog/services/1");
    await page
      .getByRole("table", { name: /وابستگی‌های این خدمت/ })
      .getByRole("link", { name: "شرکت ارتباطات زیرساخت", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/catalog\/suppliers\/1$/);
    await expect(page.getByRole("table", { name: /وابسته‌اند/ })).toContainText("درگاه پرداخت اینترنتی");
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    for (const [path, heading] of [
      ["/app/catalog/commitments", "تعهدها"],
      ["/app/catalog/assets", "دارایی‌ها"],
      ["/app/catalog/suppliers", "تأمین‌کنندگان"],
      ["/app/catalog/customers", "بانک‌ها"],
      ["/app/units", "چارت سازمانی"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expectAccessible(page);
      expect(await overflows(page), path).toBe(false);
    }
  });
});

test.describe("assessment method", () => {
  test("shows the method definition with the L table, the level rules and its versions", async ({ page }) => {
    await page.goto("/app/method");
    await expect(page.getByRole("heading", { name: "تعریف متدولوژی", level: 1 })).toBeVisible();
    await expect(page.getByRole("table", { name: "L برای هر ترکیب A و B" })).toBeVisible();
    await expect(page.getByRole("table", { name: "قواعد هر سطح ریسک" })).toContainText(/تغییر نسبت به v1/);
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    const versions = page.getByRole("region", { name: "نسخه‌ها" });
    await expect(versions.getByRole("link", { name: /v2/ })).toHaveAttribute("aria-current", "page");
  });
});
