import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ControlTest } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { ControlTestPage } from "./ControlTestPage";

const day = (jalali: string) => ({ iso: "2026-10-10", jalali });

function sheet(changes: Partial<ControlTest> = {}): ControlTest {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    reference: `REL-${index + 1}`,
    date: day(`1405/07/${String(index + 10)}`),
    path: index % 4 === 3 ? "انتشار اضطراری" : "انتشار عادی",
    performer: index === 7 || index === 11 ? null : "علی رضایی",
    passed: index !== 7 && index !== 11,
    note: index === 7 ? "تأیید دوم پس از انتشار ثبت شد" : index === 11 ? "تأییدکننده‌ی دوم همان مجری بود" : null,
  }));
  return {
    id: 8,
    code: "CA-1405-0008",
    control: {
      id: 9,
      code: "CT-0009",
      title: "تأیید دوم انتشار",
      is_key: true,
      owner: { id: 4, name: "حسین نوری" },
      href: "/controls/9/",
    },
    e: { value: 2, name: "اثربخشی محدود" },
    previous: { e: 3, code: "CA-1405-0009", href: "/controls/effectiveness/9/" },
    tester: { id: 7, name: "ندا احمدی" },
    period: { from: day("1405/07/10"), to: day("1405/08/10") },
    valid_until: { ...day("1405/11/10"), days_left: 80, overdue: false },
    evidence_age: "۹۰",
    suspended: false,
    cards: [
      { key: "exists", label: "وجود", state: "met", state_label: "احراز شد", text: "کنترل اجرا می‌شود." },
      { key: "design", label: "کفایت طراحی", state: "met", state_label: "احراز شد", text: "متوقف می‌کند." },
      { key: "coverage", label: "پوشش اجرا", state: "partial", state_label: "ناقص", text: "۲ استثنا از ۱۲ نمونه." },
      {
        key: "operating",
        label: "اثربخشی عملیاتی",
        state: "unmet",
        state_label: "احراز نشد",
        text: "شکاف شناخته‌شده در دامنه‌ی مورد اتکا؛ شرط E3 برقرار نیست.",
      },
    ],
    plan: {
      kind: "نمونه‌گیری + آزمون عملی",
      rows: [{ label: "روش آزمون", value: "بازبینی نمونه‌ای سوابق انتشار" }],
      paths: [
        { name: "انتشار عادی", passed: true },
        { name: "انتشار اضطراری", passed: false },
      ],
    },
    results: { summary: "۱۰ موفق · ۲ استثنا", rate: "۸۳٫۳", rows },
    ladder: {
      current: 2,
      previous: 3,
      target: 3,
      levels: [1, 2, 3, 4, 5].map((value) => ({ value, name: `سطح ${value}`, text: `شرح ${value}`, criteria: "" })),
      conditions: [
        { key: "design", label: "طراحی کنترل کافی است", met: true, note: null },
        { key: "gap", label: "شکاف شناخته‌شده وجود ندارد", met: false, note: "مسیر اضطراری باز است" },
      ],
      rationale: "تا رفع شکاف E2 می‌ماند.",
    },
    risks: [
      {
        id: 15,
        code: "RK-1405-0015",
        title: "اعمال بسته‌ی انتشار نامعتبر",
        href: "/risks/15/",
        assessment: { code: "AS-1405-0021", href: "/assessments/21/" },
        approved: false,
        paths: [
          {
            id: 8,
            name: "مسیر ۲ · فرمان دستی",
            b0: "۳",
            bc: "۴",
            bc_before: "۳",
            note: "کنترل دیگری این مسیر را قطع نمی‌کند",
          },
        ],
        b: "۳",
        b_change: "بدون تغییر",
        l: "۳",
        score: "۹",
        level: { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" },
        alert: "شکست کنترل کلیدی: اعتبار کاهش تعلیق شود.",
      },
    ],
    others: [
      { id: 9, code: "RK-1405-0009", href: "/risks/9/", scope: "پرداخت اینترنتی", state: "بازسنجی", tone: "warning" },
    ],
    evidence: [
      {
        id: 14,
        code: "EV-1405-0014",
        title: "تیکت‌های CAB",
        kind: "آزمون",
        observed_on: day("1405/08/15"),
        state: "current",
        state_label: "جاری",
        href: "/risks/evidence/14/",
      },
      {
        id: 20,
        code: "EV-1405-0020",
        title: "آزمون سال گذشته (مبنای E3 قبلی)",
        kind: "آزمون",
        observed_on: day("1404/08/10"),
        state: "superseded",
        state_label: "منسوخ",
        href: "/risks/evidence/20/",
      },
    ],
    rules: ["موفقیت چند نمونه برای اثبات اثربخشی در کل دامنه کافی نیست"],
    new_test_url: "/controls/9/effectiveness/new/",
    edit_url: "/controls/effectiveness/8/edit/",
    ...changes,
  };
}

function render() {
  return renderPage(<ControlTestPage />, { path: "/controls/effectiveness/8", route: "/controls/effectiveness/:pk" });
}

describe("ControlTestPage", () => {
  it("shows the four states, the ladder toward the previous level and the dependent risk", async () => {
    mockApi({ "GET controls/effectiveness/8/test/": sheet() });
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: "آزمون اثربخشی کنترل CT-0009" })).toBeInTheDocument();
    expect(screen.getByText("اثربخشی محدود · E2")).toBeInTheDocument();
    expect(screen.getByText("قبلی: E3")).toBeInTheDocument();
    const states = screen.getByRole("list", { name: "چهار وضعیت کنترل" });
    expect(within(states).getAllByRole("listitem")).toHaveLength(4);
    expect(within(states).getByText("ناقص")).toBeInTheDocument();

    const ladder = screen.getByRole("list", { name: "سطح‌های E" });
    expect(within(ladder).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
    expect(within(ladder).getByText("هدف · قبلی")).toBeInTheDocument();
    expect(screen.getByText(/برقرار نیست:/).parentElement).toHaveTextContent("مسیر اضطراری باز است");
    expect(screen.getByText(/نرخ موفقیت ۸۳٫۳٪ است/)).toBeInTheDocument();

    const risk = screen.getByRole("article", { name: /RK-1405-0015/ });
    expect(within(risk).getByText("Bc از ۳ به ۴")).toBeInTheDocument();
    expect(within(risk).getByRole("note")).toHaveTextContent("شکست کنترل کلیدی");
    expect(screen.getByRole("list", { name: "ریسک‌های دیگر با همین کنترل" })).toHaveTextContent("بازسنجی");
    expect(screen.getByText("منسوخ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ثبت نتیجه‌ی آزمون/ })).toHaveAttribute(
      "href",
      "/controls/9/effectiveness/new",
    );
    await expectNoAxeViolations(container);
  });

  it("previews the exceptions first and expands to all samples", async () => {
    const user = userEvent.setup();
    mockApi({ "GET controls/effectiveness/8/test/": sheet() });
    render();

    const table = await screen.findByRole("table", { name: "نتیجه‌ی نمونه‌های آزموده" });
    const rows = () => within(table).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(8);
    expect(within(table).getAllByText("استثنا")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /همه‌ی ۱۲ نمونه/ }));
    expect(rows()).toHaveLength(12);
  });

  it("hides recording actions from those who cannot record tests", async () => {
    mockApi({ "GET controls/effectiveness/8/test/": sheet({ new_test_url: null, edit_url: null }) });
    render();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: /ثبت نتیجه‌ی آزمون/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /افزودن شاهد/ })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET controls/effectiveness/8/test/": reply(404, { detail: "پیدا نشد" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
