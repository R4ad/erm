import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { EvaluationPage as PageData, EvaluationRow, Level } from "@/lib/types";

import { EvaluationPage } from "./EvaluationPage";

const LEVELS: Level[] = [
  { rank: 1, name: "پایین", color: "#198754", text_color: "#fff" },
  { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" },
  { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#fff" },
  { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff" },
];

function row(changes: Partial<EvaluationRow> & { id: number; code: string }): EvaluationRow {
  return {
    title: "سناریو",
    href: `/risks/${changes.id}/`,
    category: "T1",
    scope: "بانک الف",
    status: { value: "assessment", label: "ارزیابی" },
    l: 3,
    i: 3,
    score: 9,
    base_level: LEVELS[1]!,
    decision_level: LEVELS[1]!,
    raised: false,
    reasons: [],
    authority: "مالک + مدیر بالادست",
    deadline: { kind: "awaiting", text: "۳۰ روز تقویمی", due: null, overdue: false },
    sendable: false,
    assessment_href: "/assessments/1/",
    ...changes,
  };
}

function page(): PageData {
  const rows = [
    row({
      id: 1,
      code: "RK-1405-0051",
      title: "حمله‌ی باج‌افزاری به خدمت بانکی",
      l: 5,
      i: 5,
      score: 25,
      base_level: LEVELS[3]!,
      decision_level: LEVELS[3]!,
      authority: "کمیته امنیت · ارجاع فوری",
      deadline: { kind: "awaiting", text: "مهار ≤ ۲۴ ساعت", due: null, overdue: false },
      sendable: true,
    }),
    row({
      id: 2,
      code: "RK-1405-0031",
      title: "خرابی هم‌زمان مرکز داده‌ی اصلی و پشتیبان",
      l: 1,
      i: 5,
      score: 5,
      decision_level: LEVELS[2]!,
      raised: true,
      reasons: ["کف پیامد ۵: حداقل «بالا»"],
      authority: "مالک + کمیته امنیت",
      status: { value: "treatment_plan", label: "برنامه‌ی درمان" },
      deadline: { kind: "plan", text: "۹ روز کاری", due: { iso: "2026-11-27", jalali: "1405/09/06" }, overdue: false },
    }),
    row({
      id: 3,
      code: "RK-1405-0047",
      title: "نقص مستندات تحویل شیفت",
      l: 2,
      i: 2,
      score: 4,
      base_level: LEVELS[0]!,
      decision_level: LEVELS[0]!,
      deadline: { kind: "done", text: "در اجرای درمان", due: null, overdue: false },
    }),
  ];
  const matrix = [5, 4, 3, 2, 1].map((l) => ({
    l,
    cells: [1, 2, 3, 4, 5].map((i) => ({
      i,
      score: l * i,
      level: LEVELS[l * i >= 16 ? 3 : l * i >= 10 ? 2 : l * i >= 5 ? 1 : 0]!,
      raised: l === 1 && i >= 4,
      count: rows.filter((item) => item.l === l && item.i === i).length,
    })),
  }));
  return {
    method: { number: 5, status: { value: "active", label: "فعال" }, href: "/method/5/" },
    levels: LEVELS.map((level, index) => ({
      ...level,
      min_score: [1, 5, 10, 16][index]!,
      max_score: [4, 9, 15, 25][index]!,
      note: [
        "پذیرش مستند با پایش · مالک",
        "مالک و مدیر بالادست · ۳۰ روز تقویمی",
        "طرح مواجهه‌ی الزامی · ۱۰ روز کاری",
        "ارجاع فوری به کمیته · مهار ≤ ۲۴ ساعت",
      ][index]!,
      decision_rule: `قاعده‌ی ${level.name}`,
      plan: ["ثبت تصمیم طی ۳۰ روز تقویمی", "۳۰ روز تقویمی", "۱۰ روز کاری", "مهار حداکثر ۲۴ ساعت؛ طرح طی ۳ روز کاری"][
        index
      ]!,
      acceptance: ["۱۲ ماه", "۶ ماه", "۹۰ روز تقویمی", "۳۰ روز تقویمی"][index]!,
      review: ["شش‌ماهه", "سه‌ماهه", "ماهانه", "هفتگی"][index]!,
      count: rows.filter((item) => item.decision_level.rank === level.rank).length,
    })),
    raised: { count: 1, reasons: ["کف پیامد ۵"] },
    floors: [
      { impact: 5, level: "بالا" },
      { impact: 4, level: "متوسط" },
    ],
    example: { code: "RK-1405-0031", score: 5, level: "بالا" },
    rows,
    matrix,
    sendable: [1],
  };
}

describe("EvaluationPage", () => {
  it("shows the level tiles, the ordered queue, the matrix and the appetite table", async () => {
    mockApi({ "GET evaluation/": page() });
    const { container } = renderPage(<EvaluationPage />, { path: "/evaluation", route: "/evaluation" });

    const queue = await screen.findByRole("region", { name: "صف سنجش و سطح تصمیم" });
    const rows = within(queue).getAllByRole("row").slice(1);
    expect(rows.map((item) => within(item).getAllByRole("cell")[0]?.textContent)).toEqual([
      "RK-1405-0051",
      "RK-1405-0031",
      "RK-1405-0047",
    ]);
    expect(within(rows[1]!).getByText(/کف پیامد ۵/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText("مهار ≤ ۲۴ ساعت")).toBeInTheDocument();
    expect(screen.getByText("ارتقا با قواعد تقدم")).toBeInTheDocument();
    expect(screen.getByText("ParameterSet v5 · فعال", { exact: false })).toBeInTheDocument();

    const matrix = screen.getByRole("region", { name: "ماتریس تصمیم L × I" });
    const top = within(within(matrix).getAllByRole("row")[1]!).getAllByRole("cell");
    expect(top.at(-1)).toHaveTextContent("بحرانی۱ ریسک، امتیاز ۲۵");
    expect(within(matrix).getAllByText("کف")).toHaveLength(2);

    const appetite = screen.getByRole("region", { name: "اشتهای ریسک و اختیار پذیرش" });
    expect(within(appetite).getByText("مصوب مرجع مجاز")).toBeInTheDocument();
    expect(within(appetite).getByText("مهار حداکثر ۲۴ ساعت؛ طرح طی ۳ روز کاری")).toBeInTheDocument();
    expect(within(appetite).getByText("هفتگی")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("filters the queue by decision level and raised rows", async () => {
    const user = userEvent.setup();
    mockApi({ "GET evaluation/": page() });
    renderPage(<EvaluationPage />, { path: "/evaluation", route: "/evaluation" });

    const queue = await screen.findByRole("region", { name: "صف سنجش و سطح تصمیم" });
    await user.selectOptions(within(queue).getByRole("combobox", { name: "سطح تصمیم" }), "بحرانی");
    expect(within(queue).getAllByRole("row")).toHaveLength(2);

    await user.selectOptions(within(queue).getByRole("combobox", { name: "سطح تصمیم" }), "");
    await user.click(within(queue).getByRole("button", { name: /فیلتر/ }));
    await user.click(screen.getByRole("checkbox", { name: "فقط ارتقا با قواعد تقدم" }));
    expect(within(queue).getAllByRole("row")).toHaveLength(2);
    expect(within(queue).getByText("RK-1405-0031")).toBeInTheDocument();
  });

  it("sends the assessed risks to decision after confirming", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET evaluation/": page(),
      "POST risks/bulk-transition/": { done: ["RK-1405-0051"], failed: [] },
    });
    renderPage(<EvaluationPage />, { path: "/evaluation", route: "/evaluation" });

    await user.click(await screen.findByRole("button", { name: /ارسال به تصمیم/ }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/حمله‌ی باج‌افزاری به خدمت بانکی/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "ارسال به تصمیم" }));

    await waitFor(() =>
      expect(api.callsTo("POST risks/bulk-transition/")[0]?.body).toEqual({ transition: "approve", ids: [1] }),
    );
    expect(await screen.findByText("۱ ریسک برای تصمیم و طراحی برنامه‌ی درمان فرستاده شد.")).toBeInTheDocument();
  });

  it("disables sending when nothing awaits a decision, and shows load errors", async () => {
    mockApi({
      "GET evaluation/": { ...page(), rows: page().rows.map((item) => ({ ...item, sendable: false })), sendable: [] },
    });
    const first = renderPage(<EvaluationPage />, { path: "/evaluation", route: "/evaluation" });
    expect(await screen.findByRole("button", { name: /ارسال به تصمیم/ })).toBeDisabled();
    first.unmount();

    mockApi({ "GET evaluation/": reply(500, { detail: "خطا" }) });
    renderPage(<EvaluationPage />, { path: "/evaluation", route: "/evaluation" });
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
