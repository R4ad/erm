import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ScenarioLibrary, LibraryScenario } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { ScenarioLibraryPage } from "./ScenarioLibraryPage";

function row(id: number, extra: Partial<LibraryScenario> = {}): LibraryScenario {
  return {
    id,
    code: `SC-${String(id).padStart(4, "0")}`,
    title: `سناریو ${id}`,
    category: { code: "T1", name: "امنیت اطلاعات و سایبری" },
    instances: 1,
    level: { rank: 3, name: "بالا" },
    reviewed: "۱۴۰۵/۰۸/۲۵",
    active: true,
    note: null,
    ...extra,
  };
}

function library(changes: Partial<ScenarioLibrary> = {}): ScenarioLibrary {
  const rows = [
    row(2, {
      title: "اعمال بسته‌ی انتشار نامعتبر",
      category: { code: "T2", name: "نرم‌افزار و توسعه" },
      note: { tone: "warning", text: "پیشنهاد ادغام با SC-0003" },
    }),
    row(3, { title: "خطای پیکربندی", category: { code: "T4", name: "عملیات و ارائه خدمت" } }),
    row(4, { title: "باج‌افزار ایستگاه کاری", instances: 0, level: null }),
    ...Array.from({ length: 11 }, (_, index) => row(10 + index)),
  ];
  return {
    summary: { scenarios: 14, categories: 3, instances: 13, average: "۰٫۹", empty: 1, proposals: 1 },
    categories: [
      { code: "T1", name: "امنیت اطلاعات و سایبری", count: 12 },
      { code: "T2", name: "نرم‌افزار و توسعه", count: 1 },
      { code: "T4", name: "عملیات و ارائه خدمت", count: 1 },
    ],
    rows,
    selected: {
      id: 2,
      code: "SC-0002",
      title: "اعمال بسته‌ی انتشار نامعتبر",
      version: 3,
      active: true,
      merged_into: null,
      author: "نرگس امینی",
      narrative: "در فرآیند انتشار نسخه‌ی بانکی ...",
      conditions: "ثبت اشتباه تنظیمات مقصد",
      event: "اعمال تغییر نامعتبر در تولید",
      consequence: "اختلال پردازش خدمت مشتری",
      category: { code: "T2", name: "نرم‌افزار و توسعه" },
      service: "انتقال وجه ساتنا",
      href: "/risks/scenarios/2/",
      edit_url: "/risks/scenarios/2/edit/",
      instances: [
        {
          id: 55,
          code: "RK-1405-0055",
          title: "انتشار ساتنا",
          href: "/risks/55/",
          scope: "انتقال وجه ساتنا · همه‌ی بانک‌ها",
          score: 9,
          level: { rank: 2, name: "متوسط" },
        },
      ],
      proposal: {
        id: 7,
        kind: { value: "merge", label: "ادغام" },
        scenario: { id: 2, code: "SC-0002" },
        target: { id: 3, code: "SC-0003", title: "خطای پیکربندی" },
        similarity: 64,
        reason: "عامل آغازگر مشابه",
        created_by: "ندا احمدی",
        can_decide: true,
      },
    },
    options: rows.map(({ id, code, title }) => ({ id, code, title })),
    rules: [{ title: "ادغام یا تفکیک", text: "دلیل + تأیید مالک و متولی روش؛ حذف فیزیکی ممنوع" }],
    create_url: "/risks/scenarios/new/",
    can_propose: true,
    ...changes,
  };
}

function render() {
  return renderPage(<ScenarioLibraryPage />, { path: "/risks/scenarios", route: "/risks/scenarios" });
}

describe("ScenarioLibraryPage", () => {
  it("lists scenarios and shows the selected one with its instances and open proposal", async () => {
    mockApi({ "GET scenarios/library/": library() });
    const { container } = render();

    const table = await screen.findByRole("table", { name: /سناریوهای مرجع/ });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getByRole("button", { name: "اعمال بسته‌ی انتشار نامعتبر" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(table).getByText("پیشنهاد ادغام با SC-0003")).toBeInTheDocument();
    expect(within(table).getByText("بدون نمونه")).toBeInTheDocument();

    const detail = screen.getByRole("region", { name: "اعمال بسته‌ی انتشار نامعتبر" });
    expect(within(detail).getByText("ثبت اشتباه تنظیمات مقصد")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "RK-1405-0055" })).toHaveAttribute("href", "/risks/55");
    expect(within(detail).getByText("۹")).toBeInTheDocument();
    const proposal = within(detail).getByRole("region", { name: "پیشنهاد باز" });
    expect(proposal).toHaveTextContent("شباهت ۶۴٪");
    await expectNoAxeViolations(container);
  });

  it("filters by category and search, and pages through the rest", async () => {
    const user = userEvent.setup();
    mockApi({ "GET scenarios/library/": library() });
    render();

    const table = await screen.findByRole("table", { name: /سناریوهای مرجع/ });
    await user.click(screen.getByRole("button", { name: /T4 عملیات/ }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /همه/ }));
    await user.type(screen.getByRole("searchbox", { name: "جستجو در عنوان یا کد" }), "باج‌افزار");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    await user.clear(screen.getByRole("searchbox", { name: "جستجو در عنوان یا کد" }));
    await user.click(screen.getByRole("button", { name: "صفحه‌ی ۲" }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("rejects the open proposal with a reason", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET scenarios/library/": library(),
      "POST scenarios/proposals/7/decide/": library({
        selected: { ...library().selected!, proposal: null },
        summary: { ...library().summary, proposals: 0 },
      }),
    });
    render();

    await user.click(await screen.findByRole("button", { name: "رد با دلیل" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "رد پیشنهاد" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: /دلیل تصمیم/ }), "دامنه متفاوت است");
    await user.click(confirm);
    await waitFor(() =>
      expect(api.callsTo("POST scenarios/proposals/7/decide/")[0]?.body).toEqual({
        accept: false,
        reason: "دامنه متفاوت است",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "پیشنهاد باز" })).not.toBeInTheDocument());
  });

  it("records a merge proposal", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET scenarios/library/": library(),
      "POST scenarios/proposals/": library(),
    });
    render();

    await user.click(await screen.findByRole("button", { name: /پیشنهاد ادغام یا تفکیک/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: /ادغام در/ }), "3");
    await user.type(within(dialog).getByRole("textbox", { name: /دلیل/ }), "مشابه");
    await user.click(within(dialog).getByRole("button", { name: "ثبت پیشنهاد" }));
    await waitFor(() =>
      expect(api.callsTo("POST scenarios/proposals/")[0]?.body).toEqual({
        scenario: 2,
        kind: "merge",
        target: 3,
        reason: "مشابه",
      }),
    );
  });

  it("shows an error state", async () => {
    mockApi({ "GET scenarios/library/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
