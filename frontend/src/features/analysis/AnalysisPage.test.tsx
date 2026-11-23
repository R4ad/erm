import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { AnalysisPage as PageData } from "@/lib/types";

import { AnalysisIndexPage, AnalysisPage } from "./AnalysisPage";

function analysis(overrides: Partial<PageData> = {}): PageData {
  return {
    assessment: {
      id: 15,
      code: "AS-1405-0015",
      status: { value: "draft", label: "پیش‌نویس" },
      kind: { value: "current", label: "جاری" },
      horizon_months: 12,
      method_number: "5",
      href: "/assessments/15/",
      impact_url: "/assessments/15/impacts/",
      can_edit: true,
    },
    risk: {
      id: 55,
      code: "RK-1405-0055",
      title: "اعمال بسته‌ی انتشار نامعتبر در تولید",
      narrative: "بسته یا فرمان نامعتبر پیش از کنترل انتشار ممکن است به اختلال خدمت مشتری برسد",
      status: { value: "assessment", label: "در ارزیابی" },
      category: { code: "T2", name: "نرم‌افزار و توسعه" },
      href: "/risks/55/",
    },
    summary: {
      a: { value: "4", basis: "rate" },
      b: { value: "3" },
      l: { value: "3", a: 4, b: 3 },
      i: { value: "3", source: "S", dimensions: 5 },
      score: {
        value: "9",
        level: { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" },
        inherent: { score: 12, level: { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000" } },
      },
      paths: 2,
      determining: ["انتشار از پایپ‌لاین رسمی"],
    },
    initiator: {
      locked: true,
      rows: [
        { label: "تعریف عامل آغازگر", value: "ایجاد یک بسته یا فرمان انتشار نامعتبر" },
        { label: "رویداد اصلی", value: "اعمال بسته‌ی نامعتبر در محیط تولید" },
        { label: "واحد شمارش", value: "هر بسته‌ی نامعتبر یکتا، بدون توجه به تعداد هشدارها" },
        { label: "دامنه", value: "ساتنا و پایا" },
        { label: "دوره‌ی مشاهده", value: "1404/08 تا 1405/08 (12 ماه)" },
        { label: "موارد خارج از شمارش", value: "" },
        { label: "منبع شواهد", value: "تیکت‌های CAB" },
      ],
      values: {
        a_basis: "rate",
        a_count: 20,
        a_period_months: 12,
        a_coverage: 98,
        a_level: "4",
        a_high: null,
        a_confidence: "medium",
        a_rationale: "۲۰ بسته در ۱۲ ماه",
      },
      count_unit: "هر بسته‌ی نامعتبر یکتا، بدون توجه به تعداد هشدارها",
      rate: 20,
      suggestion: 4,
      insufficient: [],
      coverage_min: 95,
      period_min: 12,
      bound_rule: "lower_closed",
      bands: [
        { value: 1, name: "", lower: null, upper: 0.1, text: "کمتر از 0.1" },
        { value: 2, name: "", lower: 0.1, upper: 1, text: "0.1 تا 1" },
        { value: 3, name: "", lower: 1, upper: 10, text: "1 تا 10" },
        { value: 4, name: "", lower: 10, upper: 100, text: "10 تا 100" },
        { value: 5, name: "", lower: 100, upper: null, text: "100 یا بیشتر" },
      ],
      basis_choices: [
        { value: "rate", label: "نرخ" },
        { value: "forward", label: "شواهد آینده‌نگر" },
      ],
      confidence_choices: [
        { value: "low", label: "کم" },
        { value: "medium", label: "متوسط" },
        { value: "high", label: "زیاد" },
      ],
      evidence: [{ code: "EV-0112", title: "تیکت‌های CAB", href: "/risks/evidence/1/" }],
      evidence_count: 1,
      form_url: "/assessments/15/initiator/",
    },
    paths: {
      rows: [
        {
          id: 1,
          name: "انتشار از پایپ‌لاین رسمی",
          description: "CI/CD ← اعتبارسنجی ← تأیید دوم ← تولید",
          b0: [4, null],
          controls: [
            { code: "CT-0008", title: "اعتبارسنجی خودکار بسته", e: 3, recorded_e: 3, note: "" },
            { code: "CT-0009", title: "تأیید دوم انتشار", e: 2, recorded_e: 2, note: "" },
          ],
          bc: [3, 3],
          b: [3, 3],
          determining: true,
          notes: [],
          edit_url: "/assessments/paths/1/edit/",
        },
        {
          id: 2,
          name: "فرمان دستی در پنجره‌ی اضطراری",
          description: "",
          b0: [3, null],
          controls: [{ code: "CT-0009", title: "تأیید دوم انتشار", e: 2, recorded_e: 2, note: "" }],
          bc: [4, 4],
          b: [3, 3],
          determining: true,
          notes: [],
          edit_url: "/assessments/paths/2/edit/",
        },
      ],
      b: [3, 3],
      highs: [3, 3],
      problems: [],
      add_url: "/assessments/15/paths/new/",
    },
    controls: [
      {
        code: "CT-0009",
        title: "تأیید دوم انتشار (چهار چشم)",
        kind: { value: "preventive", label: "پیشگیرانه" },
        owner: "حسین نوری",
        preventive: true,
        href: "/controls/9/",
        test: {
          code: "CA-1",
          href: "/controls/effectiveness/1/",
          exists: true,
          design_ok: true,
          coverage: "partial",
          operating_ok: false,
          e: 2,
          recorded_e: 2,
          problem: "",
        },
        evidence: { code: "EV-0098", href: "/risks/evidence/2/", note: "۳ استثنای ثبت‌نشده" },
        test_url: "/controls/9/effectiveness/new/",
      },
      {
        code: "CT-0010",
        title: "پایش و هشدار پس از اعمال",
        kind: { value: "detective", label: "کشف" },
        owner: "علی رضایی",
        preventive: false,
        href: "/controls/10/",
        test: null,
        evidence: null,
        test_url: "/controls/10/effectiveness/new/",
      },
    ],
    matrix: {
      a: 4,
      b: 3,
      l: 3,
      rows: [
        { a: 5, cells: [2, 3, 4, 5, 5] },
        { a: 4, cells: [2, 3, 3, 4, 5] },
        { a: 3, cells: [2, 2, 3, 3, 4] },
        { a: 2, cells: [1, 2, 2, 3, 3] },
        { a: 1, cells: [1, 1, 2, 2, 2] },
      ],
      names: {},
    },
    impacts: {
      i: [3, 3],
      rows: [
        { code: "S", name: "خدمت و تداوم", level: 3, note: "اختلال ۶۰ دقیقه", unknown: false, missing: false },
        { code: "D", name: "داده و تمامیت", level: 2, note: "", unknown: false, missing: false },
      ],
    },
    uncertainty: {
      confidence: "متوسط",
      confidence_key: "medium",
      items: [
        { ok: true, text: "دوره‌ی داده 12 ماه با پوشش ثبت 98٪ دامنه" },
        { ok: false, text: "شاهد پوشش اجرای «تأیید دوم انتشار» ناقص است" },
      ],
      l_range: [3, 4],
    },
    problems: [],
    submit: { can_submit: true, url: "/assessments/15/submit/", problems: [] },
    ...overrides,
  };
}

const options = { path: "/analysis/15", route: "/analysis/:pk" };

describe("AnalysisPage", () => {
  it("shows the Figma 12 summary, matrix, paths, controls and uncertainty", async () => {
    mockApi({ "GET analysis/15/": analysis() });
    renderPage(<AnalysisPage />, options);
    expect(await screen.findByRole("heading", { name: "آنالیز ریسک", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("۲۰ بسته‌ی نامعتبر یکتا در سال")).toBeInTheDocument();
    expect(screen.getByText("جدول A × B · سطر A۴، ستون B۳")).toBeInTheDocument();
    expect(screen.getByText("متوسط · ذاتی ۱۲ بالا")).toBeInTheDocument();

    const matrix = screen.getByRole("region", { name: "ماتریس احتمال A × B" });
    const current = within(matrix).getByText("(این ارزیابی)").closest("td");
    expect(current).toHaveAttribute("aria-current", "true");
    expect(matrix).toHaveTextContent("کاهش B از ۳ به ۲ در سطر A۴ رتبه‌ی L را تغییر نمی‌دهد");

    const paths = screen.getByRole("region", { name: "مسیرهای تحقق (B0 · Bc · B)" });
    expect(within(paths).getByText("B سناریو = بیشینه‌ی ۳ و ۳")).toBeInTheDocument();
    expect(within(paths).getByRole("link", { name: "افزودن مسیر" })).toBeInTheDocument();

    const controls = screen.getByRole("region", { name: "اثربخشی کنترل‌ها (E)" });
    expect(within(controls).getByText("پوشش اجرا: ناقص")).toBeInTheDocument();
    expect(within(controls).getByText("در پیامد")).toBeInTheDocument();

    const uncertainty = screen.getByRole("region", { name: "عدم قطعیت و شواهد" });
    expect(within(uncertainty).getByText("اطمینان متوسط")).toBeInTheDocument();
    expect(within(uncertainty).getByText("۳ تا ۴")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("recomputes A from the rate and saves it through the initiator form", async () => {
    const saved = analysis();
    saved.initiator.values = { ...saved.initiator.values, a_count: 200, a_level: "5" };
    const api = mockApi({
      "GET analysis/15/": analysis(),
      "POST analysis/15/": { message: "عامل آغازگر ارزیابی AS-1405-0015 ذخیره شد.", analysis: saved },
    });
    const { user } = renderPage(<AnalysisPage />, options);
    const save = await screen.findByRole("button", { name: "ذخیره" });
    expect(save).toBeDisabled();

    const count = screen.getByLabelText("تعداد آغازگر یکتا");
    await user.clear(count);
    await user.type(count, "200");
    expect(screen.getByText("۲۰۰ در سال")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /A۵/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /ارسال برای کنترل کیفیت/ })).toBeDisabled();

    await user.click(save);
    expect(await screen.findByText("عامل آغازگر ارزیابی AS-1405-0015 ذخیره شد.")).toBeInTheDocument();
    expect(api.callsTo("POST analysis/15/")[0]?.body).toMatchObject({
      values: { a_basis: "rate", a_count: "200", a_period_months: "12", a_level: "5" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "ذخیره" })).toBeDisabled());
  });

  it("warns about short data and shows the form's errors", async () => {
    mockApi({
      "GET analysis/15/": analysis(),
      "POST analysis/15/": reply(400, {
        message: "عامل آغازگر ذخیره نشد.",
        errors: { a_level: ["داده‌ی نرخ برای سطح قطعی کافی نیست."] },
      }),
    });
    const { user } = renderPage(<AnalysisPage />, options);
    const months = await screen.findByLabelText("دوره‌ی مشاهده به ماه");
    await user.clear(months);
    await user.type(months, "6");
    expect(screen.getByText(/دوره‌ی مشاهده کمتر از ۱۲ ماه است/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("سطح A: داده‌ی نرخ برای سطح قطعی کافی نیست.");
  });

  it("lists submission problems and keeps the confirm button disabled", async () => {
    mockApi({
      "GET analysis/15/": analysis({
        submit: { can_submit: true, url: "/assessments/15/submit/", problems: ["A شاهد ندارد."] },
      }),
    });
    const { user } = renderPage(<AnalysisPage />, options);
    await user.click(await screen.findByRole("button", { name: /ارسال برای کنترل کیفیت/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("A شاهد ندارد.");
    expect(within(dialog).getByRole("button", { name: "ارسال برای کنترل کیفیت" })).toBeDisabled();
  });

  it("is read-only for an assessment that is no longer a draft", async () => {
    const data = analysis({ submit: { can_submit: false, url: null, problems: [] } });
    data.assessment = { ...data.assessment, can_edit: false, status: { value: "in_qc", label: "در کنترل کیفیت" } };
    mockApi({ "GET analysis/15/": data });
    renderPage(<AnalysisPage />, options);
    expect(await screen.findByText("ارزیابی AS-1405-0015 در کنترل کیفیت است")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ذخیره" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("تعداد آغازگر یکتا")).toBeDisabled();
  });
});

describe("AnalysisIndexPage", () => {
  it("opens the latest draft, or points to the assessment workspace", async () => {
    mockApi({ "GET analysis/": { assessment: null, workspace_url: "/assessments/" } });
    renderPage(<AnalysisIndexPage />, { path: "/analysis", route: "/analysis" });
    expect(await screen.findByText("پیش‌نویس ارزیابی‌ای برای آنالیز ندارید")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /کارتابل ارزیابی/ })).toBeInTheDocument();
  });

  it("redirects to the analysis of the latest draft", async () => {
    mockApi({ "GET analysis/": { assessment: 15, workspace_url: "/assessments/" } });
    const { router } = renderPage(<AnalysisIndexPage />, { path: "/analysis", route: "/analysis" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/analysis/15"));
  });
});
