import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { IdentificationPage as PageData, IdentificationValues } from "@/lib/types";

import { entryChecks, similarScenarios } from "./identification";
import { IdentificationPage } from "./IdentificationPage";

const blank: IdentificationValues = {
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

function page(overrides: Partial<PageData> = {}): PageData {
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
          customer: null,
          commitment: null,
        },
        {
          value: "1:3",
          label: "ساتنا · بانک ملت · SLA پردازش ۹۹٫۵٪",
          service: { id: 1, name: "ساتنا", environment: "داتین" },
          customer: "بانک ملت",
          commitment: "SLA پردازش ۹۹٫۵٪",
        },
      ],
      category: [
        { value: "1", code: "T1", label: "امنیت اطلاعات و سایبری" },
        { value: "2", code: "T2", label: "نرم‌افزار و توسعه" },
      ],
      source: [
        { value: "periodic", label: "ارزیابی دوره‌ای ریسک امنیت اطلاعات" },
        { value: "change", label: "ثبت تغییرات نرمال" },
      ],
      evidence: [{ value: "9", code: "EV-0110", label: "آمار ۱۰۰۰ بسته‌ی انتشار" }],
    },
    scenarios: [
      {
        id: 7,
        code: "SC-0007",
        title: "اعمال بسته‌ی انتشار نامعتبر در تولید",
        text: "اعمال بسته‌ی انتشار نامعتبر در تولید اعمال تغییر نامعتبر در تولید ثبت اشتباه تنظیمات مقصد",
        service_id: 1,
        category: { id: 2, code: "T2", name: "نرم‌افزار و توسعه" },
        risk_count: 3,
      },
    ],
    values: blank,
    draft: null,
    text_limit: 1000,
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
    ],
    scenarios_url: "/risks/scenarios/",
    register_url: "/risks/",
    evidence_url: "/risks/evidence/new/",
    ...overrides,
  };
}

const options = { path: "/identification", route: "/identification" };

describe("identification helpers", () => {
  it("finds overlapping library scenarios and weighs the same service", () => {
    const data = page();
    const values = { ...blank, event: "اعمال تغییر نامعتبر در تولید", conditions: "ثبت اشتباه تنظیمات مقصد" };
    const [match] = similarScenarios(values, data.scenarios, 1);
    expect(match?.scenario.code).toBe("SC-0007");
    expect(match?.percent).toBeGreaterThan(50);
    expect(similarScenarios({ ...blank, event: "قطع" }, data.scenarios, 1)).toEqual([]);
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
  it("shows the Figma 11 layout: stepper, form, side cards and recent entries", async () => {
    mockApi({ "GET identification/": page() });
    renderPage(<IdentificationPage />, options);
    expect(await screen.findByRole("region", { name: "فرم ورودی مدیر واحد" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "شناسایی ریسک", level: 1 })).toBeInTheDocument();
    const steps = screen.getByRole("region", { name: "گام‌های فرایند مدیریت ریسک" });
    expect(within(steps).getByText("شناسایی").closest("li")).toHaveAttribute("aria-current", "step");
    for (const name of ["شرط پذیرش ورودی", "سناریوهای مشابه در کتابخانه", "دسته‌ی اصلی", "منبع شناسایی"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("۰ از ۶ کامل")).toBeInTheDocument();
    const recent = screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" });
    expect(within(recent).getByRole("link", { name: "خروج اطلاعات از مسیر پشتیبانی" })).toHaveAttribute(
      "href",
      "/risks/55",
    );
    expect(within(recent).getByText("بازگشت برای تکمیل")).toBeInTheDocument();
    expect(within(recent).getByText("۵ روز مانده")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("builds the scenario sentence live and suggests answers from the chosen commitment", async () => {
    mockApi({ "GET identification/": page() });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.selectOptions(await screen.findByLabelText(/خدمت، مشتری و تعهد/), "1:3");
    expect(screen.getByLabelText(/موضوع بررسی کدام خدمت/)).toHaveValue("ساتنا");
    expect(screen.getByLabelText(/داتین، مشتری یا هر دو/)).toHaveValue("بانک ملت و داتین");
    expect(screen.getByLabelText(/کدام هدف یا تعهد/)).toHaveValue("SLA پردازش ۹۹٫۵٪");
    await user.type(screen.getByLabelText(/چه اتفاق مشخصی/), "اعمال تغییر نامعتبر در تولید");
    await user.type(screen.getByLabelText(/چه علت یا شرایطی/), "ثبت اشتباه تنظیمات مقصد");
    const sentence = screen.getByText(/در خدمت یا فرآیند/);
    expect(sentence).toHaveTextContent("ممکن است اعمال تغییر نامعتبر در تولید رخ دهد");
    expect(sentence).toHaveTextContent("[نوع و دامنه‌ی پیامد]");

    const similar = screen.getByRole("region", { name: "سناریوهای مشابه در کتابخانه" });
    await user.click(within(similar).getByRole("button", { name: /پیوند به SC-0007/ }));
    expect(within(similar).getByRole("button", { name: /اعمال بسته‌ی انتشار نامعتبر/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // پیوند به سناریو دسته‌ی خالی را از سناریو پر می‌کند.
    expect(screen.getByRole("radio", { name: /نرم‌افزار و توسعه/ })).toBeChecked();
    await expectNoAxeViolations();
  });

  it("saves a draft and keeps its id in the address", async () => {
    const api = mockApi({
      "GET identification/": page(),
      "POST identification/": {
        message: "پیش‌نویس ذخیره شد.",
        draft: { id: 12, saved_at: { iso: "2026-11-16T09:00:00+00:00", jalali: "1405/08/25 12:30" } },
        recent: [],
      },
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.selectOptions(await screen.findByLabelText(/واحد و تکمیل‌کننده/), "6");
    await user.click(screen.getByRole("radio", { name: "ثبت تغییرات نرمال" }));
    await user.type(screen.getByLabelText(/برچسب فرعی/), "ساخت و انتشار{Enter}");
    await user.click(screen.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    expect(await screen.findByText("پیش‌نویس ذخیره شد.")).toBeInTheDocument();
    expect(api.callsTo("POST identification/")[0]?.body).toMatchObject({
      submit: false,
      draft: null,
      values: { org_unit: "6", source: "change", tags: ["ساخت و انتشار"] },
    });
    const entry = screen.getByRole("region", { name: "شرط پذیرش ورودی" });
    expect(within(entry).getByText("مالک: حسین نوری")).toBeInTheDocument();
  });

  it("confirms before submitting and lists the server's missing answers", async () => {
    const api = mockApi({
      "GET identification/": page(),
      "POST identification/": reply(400, {
        message: "ورودی بدون پرسش‌های اجباری ارسال نمی‌شود.",
        errors: { harm: ["این پرسش برای ارسال اجباری است."], source: ["منبع شناسایی را انتخاب کنید."] },
      }),
    });
    const { user } = renderPage(<IdentificationPage />, options);
    await user.click(await screen.findByRole("button", { name: "ارسال برای شناسایی" }));
    const dialog = await screen.findByRole("alertdialog", { name: "ورودی برای شناسایی فرستاده شود؟" });
    expect(dialog).toHaveTextContent("«مورد جدید»");
    await user.click(within(dialog).getByRole("button", { name: "ارسال برای شناسایی" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("۲ مورد پیش از ارسال درست شود");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(api.callsTo("POST identification/")[0]?.body).toMatchObject({ submit: true });
    await user.click(within(summary).getByRole("link", { name: "آسیب قابل مشاهده و دامنه‌ی آن چیست؟" }));
    expect(screen.getByLabelText(/آسیب قابل مشاهده/)).toHaveFocus();
    expect(screen.getByLabelText(/آسیب قابل مشاهده/)).toHaveAttribute("aria-invalid", "true");
  });

  it("lets other roles see recent entries without the form", async () => {
    mockApi({ "GET identification/": page({ can_identify: false, choices: null, scenarios: [] }) });
    renderPage(<IdentificationPage />, options);
    expect(await screen.findByText("ثبت ورودی شناسایی با مدیر واحد و عضو GRC است")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "فرم ورودی مدیر واحد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ثبت سناریوی جدید/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" })).toBeInTheDocument();
  });
});
