import { expect, expectAccessible, reply, test } from "./fixtures";

import type { IdentificationPage } from "../src/lib/types";

// «شناسایی ریسک»: ویزارد شش پرسش و بازبینی، الگوی چسبان جمله، صفحه‌کلید، خطای سرور و حرکت با «کاهش حرکت»، در
// دسکتاپ و موبایل و هر دو تم. axe فقط محتوای همین صفحه (#main) را می‌سنجد؛ پوسته‌ی برنامه آزمون خودش را دارد.

const values: IdentificationPage["values"] = {
  org_unit: "",
  target: "",
  mission: "",
  subject: "",
  objective: "",
  conditions: "",
  customer: "",
  event: "",
  harm: "",
  impact: "",
  dependencies: "",
  evidence: "",
  category: "",
  tags: [],
  source: "",
  scenario: "",
  evidence_items: [],
};

function identification(overrides: Partial<IdentificationPage> = {}): IdentificationPage {
  return {
    can_identify: true,
    parts: [
      { name: "subject", label: "موضوع بررسی کدام خدمت یا فرآیند است؟", token: "خدمت" },
      { name: "objective", label: "کدام هدف یا تعهد مختل می‌شود؟", token: "هدف یا تعهد" },
      { name: "conditions", label: "چه علت یا شرایطی زمینه‌ی اختلال را فراهم می‌کند؟", token: "عامل و وضعیت" },
      { name: "customer", label: "داتین، مشتری یا هر دو متأثرند؟", token: "داتین یا مشتری" },
      { name: "event", label: "چه اتفاق مشخصی ممکن است رخ دهد؟", token: "رویداد مشخص" },
      { name: "harm", label: "آسیب قابل مشاهده و دامنه‌ی آن چیست؟", token: "نوع و دامنه‌ی پیامد" },
    ],
    choices: {
      org_unit: [{ value: "6", label: "پرداخت · حسین نوری", owner: { id: 4, name: "حسین نوری" } }],
      target: [
        {
          value: "1",
          label: "ساتنا · همه‌ی مشتریان",
          service: { id: 1, name: "ساتنا", environment: "داتین" },
          unit: "6",
          customer: null,
          commitment: null,
        },
        {
          value: "1:3",
          label: "ساتنا · بانک ملت · SLA پردازش ۹۹٫۵٪",
          service: { id: 1, name: "ساتنا", environment: "داتین" },
          unit: "6",
          customer: "بانک ملت",
          commitment: "SLA پردازش ۹۹٫۵٪",
        },
        {
          value: "2",
          label: "درگاه پرداخت اینترنتی · همه‌ی مشتریان",
          service: { id: 2, name: "درگاه پرداخت اینترنتی", environment: "داتین" },
          unit: "6",
          customer: null,
          commitment: null,
        },
      ],
      category: [{ value: "1", code: "T1", label: "امنیت اطلاعات و سایبری" }],
      source: [{ value: "change", label: "ثبت تغییرات نرمال" }],
      evidence: [{ value: "9", code: "EV-0110", label: "آمار ۱۰۰۰ بسته‌ی انتشار" }],
    },
    values,
    draft: null,
    text_limit: 1000,
    attachment: { accept: ".pdf,.png,.jpg,.docx,.txt", max_size: 20 * 1024 * 1024 },
    recent: [
      {
        key: "risk-55",
        code: "RK-1405-0055",
        title: "خروج اطلاعات از مسیر پشتیبانی",
        category: "T1",
        scenario: "SC-0021",
        service: "پشتیبانی",
        customer: "بانک ب",
        source: "مشاهده‌ی تهدید",
        stage: { value: "returned", label: "بازگشت برای تکمیل", tone: "warning" },
        owner: { id: 2, name: "زهرا کریمی" },
        due: { iso: "2026-11-23", jalali: "1405/09/02", days_left: 5, overdue: false },
        href: "/risks/55/",
        route: null,
      },
      {
        key: "draft-3",
        code: null,
        title: "قطع ارتباط با شاپرک",
        category: null,
        scenario: null,
        service: "درگاه پرداخت اینترنتی",
        customer: "همه",
        source: "",
        stage: { value: "draft", label: "پیش‌نویس", tone: "neutral" },
        owner: null,
        due: null,
        href: null,
        route: "/identification?draft=3",
      },
    ],
    scenarios_url: "/risks/scenarios/",
    register_url: "/risks/",
    evidence_url: "/risks/evidence/new/",
    ...overrides,
  };
}

const answered = {
  ...values,
  target: "1:3",
  subject: "ساتنا",
  objective: "SLA پردازش ۹۹٫۵٪",
  conditions: "ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار",
  customer: "بانک ملت و داتین",
  event: "اعمال تغییر نامعتبر در تولید",
  harm: "توقف پردازش حدود ۹۰ دقیقه",
  evidence: "۲۰ بسته‌ی نامعتبر از ۱۰۰۰ بسته در شش ماه",
};

test.describe("risk identification", () => {
  test("walks the six questions and the review from the keyboard, in both themes", async ({ page, api }) => {
    api.on("GET identification/", identification());
    await page.goto("/app/identification");
    await expect(page.getByRole("heading", { name: "شناسایی ریسک", level: 1 })).toBeVisible();
    const template = page.getByRole("region", { name: "الگوی ثبت سناریو" });
    await expect(template).toBeVisible();
    await expect(page.getByText("گام ۱ از ۷")).toBeVisible();
    await expectAccessible(page, "#main");

    const subject = page.getByRole("textbox", { name: /موضوع بررسی کدام خدمت/ });
    await subject.fill("سات");
    await page.getByRole("button", { name: /ساتنا.*بانک ملت/ }).click();
    await subject.press("Enter");
    await expect(page.getByText("گام ۲ از ۷")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /کدام هدف یا تعهد/ })).toBeFocused();
    await page.keyboard.press("Enter");
    const conditions = page.getByRole("textbox", { name: /چه علت یا شرایطی/ });
    await expect(conditions).toBeFocused();
    await page.keyboard.type("ثبت اشتباه تنظیمات مقصد");
    await expect(template.locator("[data-active]")).toHaveText("ثبت اشتباه تنظیمات مقصد");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: /داتین، مشتری یا هر دو/ })).toHaveValue("بانک ملت و داتین");
    await page.keyboard.press("Enter");
    await page.keyboard.type("اعمال تغییر نامعتبر در تولید");
    await page.keyboard.press("Enter");
    await page.keyboard.type("توقف پردازش حدود ۹۰ دقیقه");
    await page.keyboard.press("Enter");

    const review = page.getByRole("region", { name: "بازبینی" });
    await expect(page.getByText("گام ۷ از ۷")).toBeVisible();
    await expect(review.getByRole("textbox", { name: /شاهد، تجربه و تغییر اخیر/ })).toBeFocused();
    await expect(review.getByText("اعمال تغییر نامعتبر در تولید در ساتنا")).toBeVisible();
    await expect(review.getByText("مالک: حسین نوری")).toBeVisible();
    await expectAccessible(page, "#main");
    // هیچ عرضی پیمایش افقی صفحه نمی‌سازد.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("keeps the scenario template in view while the page scrolls", async ({ page, api }) => {
    api.on("GET identification/", identification({ values: answered }));
    await page.goto("/app/identification");
    await page.getByRole("button", { name: /گام ۷: بازبینی/ }).click();
    const template = page.getByRole("region", { name: "الگوی ثبت سناریو" });
    await expect(template).toHaveCSS("position", "sticky");
    await page.getByRole("region", { name: "ورودی‌های اخیر شناسایی" }).scrollIntoViewIfNeeded();
    const box = await template.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThan(viewport.height / 2);
  });

  test.describe("with a refused submission", () => {
    test.use({ allowConsoleErrors: [/status of 400/] });

    test("sends the user to the question the server refused", async ({ page, api }) => {
      api.on("GET identification/", identification({ values: answered }));
      api.on(
        "POST identification/",
        reply(400, {
          message: "ورودی بدون پرسش‌های اجباری ارسال نمی‌شود.",
          errors: { harm: ["این پرسش برای ارسال اجباری است."] },
        }),
      );
      await page.goto("/app/identification");
      await page.getByRole("button", { name: /گام ۷: بازبینی/ }).click();
      await page.getByRole("button", { name: "ارسال برای شناسایی" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "ارسال برای شناسایی" }).click();
      const harm = page.getByRole("textbox", { name: /آسیب قابل مشاهده/ });
      await expect(harm).toBeFocused();
      await expect(harm).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText("گام ۶ از ۷")).toBeVisible();
      await expect(page.getByRole("alert")).toContainText("۱ مورد پیش از ارسال درست شود");
      await expectAccessible(page, "#main");
    });
  });

  test("saves the draft with Ctrl+S", async ({ page, api }) => {
    api.on("GET identification/", identification());
    api.on("POST identification/", {
      message: "پیش‌نویس ذخیره شد.",
      draft: { id: 12, saved_at: { iso: "2026-11-16T09:00:00+00:00", jalali: "1405/08/25 12:30" }, attachments: [] },
      recent: [],
    });
    await page.goto("/app/identification");
    await page.getByRole("textbox", { name: /موضوع بررسی کدام خدمت/ }).fill("فرآیند تسویه");
    await page.keyboard.press("Control+s");
    await expect(page.getByText("پیش‌نویس ذخیره شد.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/identification\?draft=12$/);
    expect(api.callsTo("POST identification/")[0]?.body).toMatchObject({
      submit: false,
      values: { subject: "فرآیند تسویه" },
    });
  });

  test("slides steps in reading direction and only fades them with reduced motion", async ({ page, api }) => {
    api.on("GET identification/", identification({ values: answered }));
    await page.goto("/app/identification");
    const step = page.locator(".wizard-step");
    // اولین گام هنگام باز شدن صفحه حرکت ندارد.
    await expect(step).toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: "بعدی" }).click();
    await expect(step).toHaveCSS("animation-name", "wizard-step-in");
    await expect(step).toHaveAttribute("data-direction", "forward");
    // «بعدی» در راست‌به‌چپ از چپ می‌آید.
    expect(await step.evaluate((element) => getComputedStyle(element).getPropertyValue("--wizard-shift").trim())).toBe(
      "-1rem",
    );
    await page.getByRole("button", { name: "قبلی" }).click();
    await expect(step).toHaveAttribute("data-direction", "back");
    expect(await step.evaluate((element) => getComputedStyle(element).getPropertyValue("--wizard-shift").trim())).toBe(
      "1rem",
    );
    await expect(page.locator(".scenario-token[data-active]")).toHaveCSS("animation-name", "token-mark");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "بعدی" }).click();
    await expect(step).toHaveCSS("animation-name", "wizard-step-fade");
    await expect(page.locator(".scenario-token[data-active]")).toHaveCSS("animation-name", "none");
  });
});
