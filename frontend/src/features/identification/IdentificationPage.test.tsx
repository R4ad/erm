import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deferred, mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { IdentificationChoices, IdentificationPage as PageData, IdentificationValues } from "@/lib/types";

import { identificationParts, identificationValues } from "@/test/fixtures";

import { autoUnit, entryChecks, matchTargets, narrative, stepOfField, withTarget } from "./identification";
import { IdentificationPage } from "./IdentificationPage";

const blank = identificationValues();
const parts = identificationParts;

function choices(overrides: Partial<IdentificationChoices> = {}): IdentificationChoices {
  return {
    org_unit: [{ value: "6", name: "پرداخت", owner: { id: 4, name: "حسین نوری" } }],
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
        label: "پایا · همه‌ی مشتریان",
        service: { id: 2, name: "پایا", environment: "داتین" },
        unit: "8",
        customer: null,
        commitment: null,
      },
    ],
    category: [{ value: "1", code: "T1", label: "امنیت اطلاعات و سایبری" }],
    source: [{ value: "periodic", label: "ارزیابی دوره‌ای ریسک امنیت اطلاعات" }],
    evidence: [{ value: "9", code: "EV-0110", label: "آمار ۱۰۰۰ بسته‌ی انتشار" }],
    ...overrides,
  };
}

/** پاسخ هر شش پرسش، برای آزمون‌هایی که از بازبینی شروع می‌کنند. */
const answered: IdentificationValues = {
  ...blank,
  target: "1:3",
  subject: "ساتنا",
  objective: "SLA پردازش ۹۹٫۵٪",
  conditions: "ثبت اشتباه تنظیمات مقصد",
  customer: "بانک ملت و داتین",
  event: "اعمال تغییر نامعتبر در تولید",
  harm: "توقف پردازش حدود ۹۰ دقیقه",
};

function page(overrides: Partial<PageData> = {}): PageData {
  return {
    can_identify: true,
    can_answer: false,
    parts,
    choices: choices(),
    values: blank,
    draft: null,
    text_limit: 1000,
    attachment: { accept: ".pdf,.png,.txt", max_size: 20 * 1024 * 1024 },
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
        key: "risk-56",
        code: "RK-1405-0056",
        title: "قطع درگاه پرداخت",
        category: null,
        scenario: null,
        service: "ساتنا",
        customer: "همه",
        source: "",
        stage: { value: "identified", label: "شناسایی‌شده", tone: "info" },
        owner: null,
        due: null,
        href: "/risks/56/",
        route: "/risks/56",
      },
    ],
    scenarios_url: "/risks/scenarios/",
    register_url: "/risks/",
    evidence_url: "/risks/evidence/new/",
    ...overrides,
  };
}

const options = { path: "/identification", route: "/identification" };
const savedDraft = {
  message: "پیش‌نویس ذخیره شد.",
  draft: {
    id: 12,
    status: { value: "draft" as const, label: "پیش‌نویس" },
    saved_at: { iso: "2026-11-16T09:00:00+00:00", jalali: "1405/08/25 12:30" },
    attachments: [],
  },
  recent: [],
};

const question = (label: RegExp) => screen.getByRole("textbox", { name: label });
const position = () => screen.getByText(/^گام .+ از ۷$/);
const activeToken = () =>
  within(screen.getByRole("region", { name: "الگوی ثبت سناریو" }))
    .getAllByText(/.+/)
    .find((element) => element.hasAttribute("data-active"));

describe("identification helpers", () => {
  it("picks the unit like the server: the only unit, else the service unit if it is the user's", () => {
    expect(autoUnit(choices(), "2")?.value).toBe("6"); // فقط یک واحد دارد، خدمت هر واحدی باشد
    const two = choices({
      org_unit: [
        { value: "6", name: "پرداخت", owner: null },
        { value: "7", name: "تسویه", owner: null },
      ],
    });
    expect(autoUnit(two, "1")?.value).toBe("6");
    expect(autoUnit(two, "2")).toBeNull();
    expect(autoUnit(two, "")).toBeNull();
  });

  it("suggests services whatever the keyboard and keeps a subject the user wrote", () => {
    const targets = choices().target;
    expect(matchTargets("ملت", targets).map((target) => target.value)).toEqual(["1:3"]);
    expect(matchTargets("پايا", targets).map((target) => target.value)).toEqual(["2"]); // «ي» عربی
    const sla = targets[1]!;
    expect(withTarget({ ...blank, subject: "سات" }, sla)).toMatchObject({
      target: "1:3",
      subject: "ساتنا",
      customer: "بانک ملت و داتین",
      objective: "SLA پردازش ۹۹٫۵٪",
    });
    expect(withTarget({ ...blank, subject: "محیط تولید", customer: "داتین" }, sla)).toMatchObject({
      subject: "محیط تولید",
      customer: "داتین",
    });
    // موضوعی که مدیر واحد آزاد نوشته همه‌ی واژه‌ها را در یک خدمت ندارد؛ خدمت‌هایی با واژه‌ی مشترک پیشنهاد می‌شوند و
    // واژه‌های کوتاه («در») چیزی پیدا نمی‌کنند.
    expect(matchTargets("سامانه‌ی ساتنا در محیط تولید", targets).map((target) => target.value)).toEqual(["1", "1:3"]);
    expect(matchTargets("ساتنا ملت پرداخت", targets).map((target) => target.value)).toEqual(["1:3", "1"]);
    expect(matchTargets("در", targets)).toEqual([]);
  });

  it("maps every server field to a wizard step and builds the narrative", () => {
    expect(stepOfField("target", parts)).toBe("subject");
    expect(stepOfField("org_unit", parts)).toBe("subject");
    expect(stepOfField("harm", parts)).toBe("harm");
    expect(stepOfField("evidence_file", parts)).toBe("review");
    expect(stepOfField("category", parts)).toBe("review");
    expect(narrative({ ...blank, event: "قطع" })).toContain("ممکن است قطع رخ دهد");
    expect(narrative(blank)).toContain("در خدمت یا فرآیند …،");
  });

  it("counts entry criteria; an assumption without evidence is a warning, not a pass", () => {
    const values = { ...blank, objective: "ه", event: "ر", target: "1", customer: "ب", evidence: "فرض" };
    const result = entryChecks(values, "حسین نوری");
    expect(result.met).toBe(4);
    expect(result.evidence).toBe("assumption");
    expect(entryChecks({ ...values, evidence_items: ["9"] }, "حسین نوری").met).toBe(5);
  });
});

describe("IdentificationPage", () => {
  it("leads with identification in the lifecycle and keeps only the wizard, its template and recent entries", async () => {
    mockApi({ "GET identification/": page() });
    renderPage(<IdentificationPage />, options);
    expect(await screen.findByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "شناسایی ریسک", level: 1 })).toBeInTheDocument();

    const lifecycle = screen.getByRole("region", { name: "گام‌های فرایند مدیریت ریسک" });
    const first = within(lifecycle).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("شناسایی");
    expect(first).toHaveAttribute("aria-current", "step");
    expect(within(lifecycle).queryByText("تعیین بافتار")).not.toBeInTheDocument();

    // عناصری که از صفحه رفته‌اند.
    for (const label of [/واحد و تکمیل‌کننده/, /خدمت، مشتری و تعهد/, /مأموریت و خروجی اصلی/]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    for (const name of ["سناریوهای مشابه در کتابخانه", "دسته‌ی اصلی", "منبع شناسایی", "شرط پذیرش ورودی"]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: /کتابخانه‌ی سناریو/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ثبت سناریوی جدید/ })).not.toBeInTheDocument();

    expect(screen.getByRole("region", { name: "الگوی ثبت سناریو" })).toHaveClass("sticky");
    expect(position()).toHaveTextContent("گام ۱ از ۷");
    expect(screen.getByRole("progressbar", { name: "پیشرفت ثبت سناریو" })).toHaveAttribute("aria-valuenow", "1");
    const steps = within(screen.getByRole("navigation", { name: "گام‌های ثبت سناریو" })).getAllByRole("button");
    expect(steps).toHaveLength(7);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[6]).toHaveAccessibleName(/گام ۷: بازبینی/);
    // فقط یک پرسش در هر گام.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    const recent = screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" });
    expect(within(recent).queryByRole("columnheader", { name: "منبع" })).not.toBeInTheDocument();
    expect(within(recent).queryByText("مشاهده‌ی تهدید")).not.toBeInTheDocument();
    expect(within(recent).getByRole("link", { name: "خروج اطلاعات از مسیر پشتیبانی" })).toHaveAttribute(
      "href",
      "/risks/55",
    );
    expect(within(recent).getByText("۵ روز مانده")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("suggests services on the first question, fills the hidden target and moves on with Enter", async () => {
    const api = mockApi({ "GET identification/": page(), "POST identification/": savedDraft });
    const { user } = renderPage(<IdentificationPage />, options);
    const subject = await screen.findByRole("textbox", { name: /موضوع بررسی کدام خدمت/ });
    await user.type(subject, "ملت");
    const suggestions = screen.getByRole("list", { name: /پیشنهاد از فهرست خدمت‌ها/ });
    expect(within(suggestions).getAllByRole("button")).toHaveLength(1);
    await user.click(within(suggestions).getByRole("button", { name: /ساتنا/ }));
    // «ملت» بخشی از نام خدمت نبود؛ پس موضوع نوشته‌شده می‌ماند و فقط خدمت پشت صحنه انتخاب می‌شود.
    expect(subject).toHaveValue("ملت");
    expect(screen.getByText(/خدمت انتخاب‌شده:/)).toHaveTextContent("ساتنا · بانک ملت · SLA پردازش ۹۹٫۵٪");
    await user.clear(subject);
    await user.type(subject, "سات");
    await user.click(screen.getByRole("button", { name: /ساتنا.*بانک ملت/ }));
    expect(subject).toHaveValue("ساتنا");

    await user.type(subject, "{Enter}");
    expect(position()).toHaveTextContent("گام ۲ از ۷");
    const objective = question(/کدام هدف یا تعهد/);
    expect(objective).toHaveFocus();
    expect(objective).toBeRequired();
    expect(subject).not.toBeRequired(); // موضوع اختیاری است؛ خدمتِ انتخاب‌شده اجباری است
    expect(objective).toHaveValue("SLA پردازش ۹۹٫۵٪"); // از تعهد انتخاب‌شده پیشنهاد شد
    expect(activeToken()).toHaveTextContent("SLA پردازش ۹۹٫۵٪");

    await user.keyboard("{Enter}");
    expect(question(/چه علت یا شرایطی/)).toHaveFocus();
    await user.keyboard("{Enter}"); // پاسخ خالی: می‌ماند و خطا می‌گوید
    expect(position()).toHaveTextContent("گام ۳ از ۷");
    expect(question(/چه علت یا شرایطی/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(REQUIRED_TEXT)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    await screen.findByText("پیش‌نویس ذخیره شد.");
    expect(api.callsTo("POST identification/")[0]?.body).toMatchObject({
      submit: false,
      values: { target: "1:3", subject: "ساتنا", customer: "بانک ملت و داتین" },
    });
  });

  it("updates the sentence with every letter, highlights the current part and announces it politely", async () => {
    mockApi({ "GET identification/": page({ values: { ...blank, target: "1", subject: "ساتنا" } }) });
    const { user } = renderPage(<IdentificationPage />, options);
    const template = await screen.findByRole("region", { name: "الگوی ثبت سناریو" });
    expect(activeToken()).toHaveTextContent("ساتنا");
    await user.click(screen.getByRole("button", { name: /گام ۵: رویداد مشخص/ }));
    expect(question(/چه اتفاق مشخصی/)).toHaveFocus();
    expect(activeToken()).toHaveTextContent("[رویداد مشخص]");

    await user.keyboard("ق");
    expect(activeToken()).toHaveTextContent(/^ق$/); // بی‌درنگ، بدون انتظار
    await user.keyboard("طع درگاه");
    expect(within(template).getByText("قطع درگاه")).toHaveAttribute("data-active");
    expect(template).toHaveTextContent("[نوع و دامنه‌ی پیامد]");

    const live = screen.getByTestId("scenario-sentence-live");
    expect(live).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(live).toHaveTextContent("ممکن است قطع درگاه رخ دهد"), { timeout: 2000 });
  });

  it("jumps to any step, goes back and forth and ends with a review", async () => {
    mockApi({ "GET identification/": page({ values: answered }) });
    const { user } = renderPage(<IdentificationPage />, options);
    const nav = await screen.findByRole("navigation", { name: "گام‌های ثبت سناریو" });
    expect(within(nav).getByRole("button", { name: /گام ۲: هدف یا تعهد، پاسخ دارد/ })).toBeInTheDocument();
    await user.click(within(nav).getByRole("button", { name: /گام ۶/ }));
    expect(position()).toHaveTextContent("گام ۶ از ۷");
    expect(within(nav).getByRole("button", { name: /گام ۶/ })).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: "قبلی" }));
    expect(question(/چه اتفاق مشخصی/)).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "بعدی" }));
    await user.click(screen.getByRole("button", { name: "بعدی" }));

    const review = screen.getByRole("region", { name: "بازبینی" });
    expect(position()).toHaveTextContent("گام ۷ از ۷");
    expect(within(review).getByRole("textbox", { name: /شاهد، تجربه و تغییر اخیر/ })).toHaveFocus();
    expect(within(review).getByText(/در خدمت یا فرآیند ساتنا، به علت یا در شرایط ثبت اشتباه/)).toBeInTheDocument();
    expect(within(review).getByText("اعمال تغییر نامعتبر در تولید در ساتنا")).toBeInTheDocument();
    expect(within(review).getByRole("heading", { name: "شرط پذیرش ورودی" })).toBeInTheDocument();
    expect(within(review).getByText("مالک: حسین نوری")).toBeInTheDocument();
    expect(within(review).getByRole("textbox", { name: /پیامد برای شرکت و مشتری/ })).not.toBeRequired();
    expect(within(review).getByRole("textbox", { name: /وابستگی و جایگزین/ })).not.toBeRequired();
    expect(within(review).getByLabelText(/پیوست فایل شاهد/)).toHaveAttribute("type", "file");
    expect(screen.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "بعدی" })).not.toBeInTheDocument();
    await expectNoAxeViolations();

    // شاهد برای ارسال اجباری است.
    await user.click(screen.getByRole("button", { name: "ارسال برای شناسایی" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const evidence = within(review).getByRole("textbox", { name: /شاهد، تجربه و تغییر اخیر/ });
    expect(evidence).toHaveAttribute("aria-invalid", "true");
    expect(evidence).toHaveFocus();
    await user.type(evidence, "۲۰ بسته‌ی نامعتبر از ۱۰۰۰ بسته");
    await user.click(screen.getByRole("button", { name: "ارسال برای شناسایی" }));
    expect(await screen.findByRole("alertdialog", { name: "ورودی برای شناسایی فرستاده شود؟" })).toHaveTextContent(
      "«مورد جدید»",
    );
  });

  it("sends an unanswered submission to the first incomplete step", async () => {
    mockApi({ "GET identification/": page({ values: { ...answered, conditions: "", evidence: "فرض" } }) });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    expect(screen.getByRole("button", { name: "عامل و وضعیت" })).toBeInTheDocument(); // پرسش بی‌جواب در بازبینی
    await user.click(screen.getByRole("button", { name: "ارسال برای شناسایی" }));
    expect(position()).toHaveTextContent("گام ۳ از ۷");
    expect(question(/چه علت یا شرایطی/)).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("۱ مورد پیش از ارسال درست شود");
  });

  it("takes the user to the step of the question the server refused", async () => {
    const api = mockApi({
      "GET identification/": page({ values: { ...answered, evidence: "فرض" } }),
      "POST identification/": reply(400, {
        message: "ورودی بدون پرسش‌های اجباری ارسال نمی‌شود.",
        errors: {
          harm: ["این پرسش برای ارسال اجباری است."],
          evidence_file: ["محتوای فایل با پسوندش نمی‌خواند."],
        },
      }),
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    await user.click(screen.getByRole("button", { name: "ارسال برای شناسایی" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "ارسال برای شناسایی" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("۲ مورد پیش از ارسال درست شود");
    expect(api.callsTo("POST identification/")[0]?.body).toMatchObject({ submit: true });
    await waitFor(() => expect(question(/آسیب قابل مشاهده/)).toHaveFocus());
    expect(position()).toHaveTextContent("گام ۶ از ۷");
    expect(question(/آسیب قابل مشاهده/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /گام ۷: بازبینی، خطا دارد/ })).toBeInTheDocument();

    await user.click(within(summary).getByRole("link", { name: "فایل شاهد" }));
    expect(position()).toHaveTextContent("گام ۷ از ۷");
    expect(screen.getByLabelText(/پیوست فایل شاهد/)).toHaveFocus();
    expect(screen.getByText("محتوای فایل با پسوندش نمی‌خواند.")).toBeInTheDocument();
  });

  it("points a unit the server could not choose back to the first question", async () => {
    mockApi({
      "GET identification/": page({ values: { ...answered, evidence: "فرض" } }),
      "POST identification/": reply(400, {
        message: "ورودی بدون پرسش‌های اجباری ارسال نمی‌شود.",
        errors: { subject: ["واحد مالک خدمت «ساتنا» (پرداخت) جزو واحدهایی نیست که برایشان ریسک شناسایی می‌کنید."] },
      }),
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    await user.click(screen.getByRole("button", { name: "ارسال برای شناسایی" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ارسال برای شناسایی" }),
    );
    await waitFor(() => expect(question(/موضوع بررسی کدام خدمت/)).toHaveFocus());
    expect(position()).toHaveTextContent("گام ۱ از ۷");
    expect(question(/موضوع بررسی کدام خدمت/)).toHaveAccessibleDescription(/جزو واحدهایی نیست/);
  });

  it("warns on the first question when the chosen service's unit is not active", async () => {
    mockApi({
      "GET identification/": page({
        choices: choices({
          org_unit: [
            { value: "6", name: "پرداخت", owner: null },
            { value: "7", name: "تسویه", owner: null },
          ],
        }),
      }),
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.type(await screen.findByRole("textbox", { name: /موضوع بررسی کدام خدمت/ }), "پایا");
    await user.click(screen.getByRole("button", { name: /پایا/ }));
    await user.click(screen.getByRole("button", { name: "بعدی" }));
    expect(position()).toHaveTextContent("گام ۱ از ۷");
    expect(screen.getByText(/واحد مالک «پایا» فعال نیست/)).toBeInTheDocument();
  });

  it("saves a draft without a unit with Ctrl+S, keeps its id in the address and uploads the evidence file", async () => {
    const api = mockApi({
      "GET identification/": page(),
      "POST identification/": {
        ...savedDraft,
        draft: { ...savedDraft.draft, attachments: [{ id: 3, name: "گزارش.pdf", size: 2048 }] },
      },
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.type(await screen.findByRole("textbox", { name: /موضوع بررسی کدام خدمت/ }), "فرآیند تازه");
    expect(screen.getByText("تغییر ذخیره‌نشده")).toBeInTheDocument();
    await user.keyboard("{Control>}s{/Control}");
    await screen.findByText("پیش‌نویس ذخیره شد.");
    const first = api.callsTo("POST identification/")[0]?.body;
    expect(first).toMatchObject({
      submit: false,
      draft: null,
      values: { org_unit: "", target: "", subject: "فرآیند تازه" },
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/identification?draft=12"));
    expect(screen.queryByText("تغییر ذخیره‌نشده")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /گام ۷: بازبینی/ }));
    expect(screen.getByRole("list", { name: "فایل‌های شاهد پیش‌نویس" })).toHaveTextContent("گزارش.pdf");
    const file = new File(["%PDF-1.4"], "نامه.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/پیوست فایل شاهد/), file);
    await user.click(screen.getByRole("button", { name: "برداشتن گزارش.pdf" }));
    await user.click(screen.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    await waitFor(() => expect(api.callsTo("POST identification/")).toHaveLength(2));
    const body = api.callsTo("POST identification/")[1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("evidence_file") as File).name).toBe("نامه.pdf");
    expect(JSON.parse(body.get("payload") as string)).toMatchObject({ draft: 12, remove_attachments: [3] });
  });

  it("keeps what was typed during a save marked unsaved, since the server never got it", async () => {
    const answer = deferred();
    const api = mockApi({ "GET identification/": page(), "POST identification/": answer.promise });
    const { user } = renderPage(<IdentificationPage />, options);
    const subject = await screen.findByRole("textbox", { name: /موضوع بررسی کدام خدمت/ });
    await user.type(subject, "فرآیند");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(api.callsTo("POST identification/")).toHaveLength(1));
    await user.type(subject, " تازه");
    answer.resolve(savedDraft);
    await screen.findByText("پیش‌نویس ذخیره شد.");
    expect(api.callsTo("POST identification/")[0]?.body).toMatchObject({ values: { subject: "فرآیند" } });
    expect(screen.getByText("تغییر ذخیره‌نشده")).toBeInTheDocument();
  });

  it("refuses a file type the server would refuse", async () => {
    mockApi({ "GET identification/": page({ values: answered }) });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    const input = screen.getByLabelText(/پیوست فایل شاهد/);
    fireEvent.change(input, { target: { files: [new File(["x"], "اسکریپت.exe")] } });
    expect(await screen.findByText(/این نوع فایل پذیرفته نمی‌شود/)).toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes and warns the browser on unload", async () => {
    mockApi({ "GET identification/": page() });
    const { user } = renderPage(<IdentificationPage />, {
      ...options,
      routes: [{ path: "/risks/:id", element: <h1>پرونده‌ی ریسک</h1> }],
    });
    await user.type(await screen.findByRole("textbox", { name: /موضوع بررسی کدام خدمت/ }), "ساتنا");
    const unload = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(unload);
    });
    expect(unload.defaultPrevented).toBe(true);

    await user.click(screen.getByRole("link", { name: "قطع درگاه پرداخت" }));
    const dialog = await screen.findByRole("alertdialog", { name: "تغییرات ذخیره نشده است" });
    await user.click(within(dialog).getByRole("button", { name: "ماندن در صفحه" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/identification");
    expect(screen.getByRole("textbox", { name: /موضوع بررسی کدام خدمت/ })).toHaveValue("ساتنا");
  });

  it("lets other roles see recent entries without the form", async () => {
    mockApi({ "GET identification/": page({ can_identify: false, choices: null }) });
    renderPage(<IdentificationPage />, options);
    expect(await screen.findByText("ثبت ورودی شناسایی با عضو GRC و مدیر سامانه است")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /پاسخ به پرسشنامه‌ها/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "الگوی ثبت سناریو" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" })).toBeInTheDocument();
  });

  it("asks before a draft row replaces what GRC has typed into a new entry", async () => {
    mockApi({
      "GET identification/": page({
        recent: [
          {
            key: "draft-31",
            code: null,
            title: "توقف سامانه‌ی آزمون پس از انتشار",
            category: null,
            scenario: null,
            service: null,
            customer: null,
            source: "",
            stage: { value: "draft", label: "پیش‌نویس", tone: "neutral" },
            owner: null,
            due: null,
            href: null,
            route: "/identification?draft=31",
          },
        ],
      }),
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.type(await screen.findByRole("textbox", { name: /موضوع بررسی کدام خدمت/ }), "سامانه‌ی پیامک");
    const recent = screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" });
    await user.click(within(recent).getByRole("link", { name: /توقف سامانه‌ی آزمون/ }));
    // نشانی فقط در ?draft= فرق دارد ولی فرم از نو ساخته می‌شود؛ نوشته‌ی ذخیره‌نشده بی‌هشدار از دست نمی‌رود.
    const dialog = await screen.findByRole("alertdialog", { name: "تغییرات ذخیره نشده است" });
    await user.click(within(dialog).getByRole("button", { name: "ماندن در صفحه" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/identification$/);
    expect(question(/موضوع بررسی کدام خدمت/)).toHaveValue("سامانه‌ی پیامک");
  });

  it("sends a unit manager to questionnaire answers", async () => {
    mockApi({ "GET identification/": page({ can_identify: false, can_answer: true, choices: null }) });
    renderPage(<IdentificationPage />, options);
    expect(await screen.findByText("ثبت و تکمیل ریسک در این صفحه با عضو GRC است")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /پاسخ به پرسشنامه‌ها/ })).toHaveAttribute("href", "/questionnaire-answers");
    expect(screen.queryByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

const REQUIRED_TEXT = "این پرسش برای ارسال اجباری است.";
