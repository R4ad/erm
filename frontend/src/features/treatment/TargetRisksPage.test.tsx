import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { TargetRisksPage as PageData, TargetRow } from "@/lib/types";

import { TargetRisksPage } from "./TargetRisksPage";

function row(id: number, changes: Partial<TargetRow> = {}): TargetRow {
  return {
    id,
    risk: {
      id,
      code: `RK-1405-00${id}`,
      title: `ریسک ${id}`,
      href: `/risks/${id}/`,
      category: "T1",
      scope: "بانک الف",
    },
    current: { score: 20, level: null, profile: "S5 D4 F4 C4 R3" },
    target: { score: 8, level: null, profile: "S4 D4 F3 C4 R3" },
    retire: false,
    mechanisms: ["B ۵→۱", "I ۵→۴"],
    criteria: "دو مانع مستقل E3 روی مسیر ممتاز",
    plan: {
      href: `/actions/plans/${id}/`,
      action: `TR-1405-00${id}`,
      due: { iso: "2026-11-26", jalali: "1405/09/05" },
    },
    status: { value: "on_track", label: "در مسیر", tone: "info" },
    ...changes,
  };
}

function page(): PageData {
  return {
    rows: [
      row(51),
      row(56, {
        retire: true,
        target: null,
        mechanisms: ["حذف مسیر"],
        status: { value: "proof", label: "در انتظار اثبات", tone: "neutral" },
      }),
      row(53, {
        current: { score: 20, level: null, profile: null },
        target: { score: 12, level: null, profile: null },
        mechanisms: ["B ۵→۲"],
        status: { value: "above", label: "بالاتر از اشتها", tone: "warning" },
      }),
    ],
    counts: { with_target: 3, within: 1, above: 1, retire: 1 },
    reassess: [
      { code: "RK-1405-0055", title: "خطای انسانی", step: "ارزیابی جاری تازه", href: "/assessments/risks/55/new/" },
    ],
  };
}

function render() {
  return renderPage(<TargetRisksPage />, { path: "/treatment/targets", route: "/treatment/targets" });
}

describe("TargetRisksPage", () => {
  it("shows tiles, the score path chart and the target table", async () => {
    mockApi({ "GET treatment/targets/": page() });
    const { container } = render();

    const chart = await screen.findByRole("region", { name: "مسیر امتیاز جاری به هدف" });
    expect(within(chart).getByRole("group", { name: "RK-1405-0051: جاری ۲۰، هدف ۸" })).toBeInTheDocument();
    expect(within(chart).getByRole("group", { name: "RK-1405-0056: جاری ۲۰، هدف حذف مسیر" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "ریسک‌های هدف به ترتیب امتیاز جاری" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText("S5 D4 F4 C4 R3")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("B ۵→۱")).toHaveAttribute("dir", "ltr");
    expect(within(rows[2]!).getByText("بازنشستگی نمونه")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("در انتظار اثبات")).toBeInTheDocument();
    expect(screen.getAllByText("هدف بالاتر از اشتها")).toHaveLength(2); // کاشی و قاعده
    expect(screen.getByText("وعده، امتیاز را کم نمی‌کند")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("filters to targets above appetite and lists post-action steps", async () => {
    const user = userEvent.setup();
    mockApi({ "GET treatment/targets/": page() });
    render();

    await user.click(await screen.findByRole("button", { name: /فیلتر/ }));
    await user.click(screen.getByRole("checkbox", { name: "فقط هدف بالاتر از اشتها" }));
    await user.keyboard("{Escape}");
    const table = screen.getByRole("table", { name: "ریسک‌های هدف به ترتیب امتیاز جاری" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("RK-1405-0053")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ثبت ارزیابی پس از اقدام" }));
    const item = screen.getByRole("menuitem", { name: /RK-1405-0055/ });
    expect(item).toHaveTextContent("ارزیابی جاری تازه");
    expect(item).toHaveAttribute("href", "/assessments/risks/55/new");
  });

  it("disables the post-action button when no plan is ready and shows the empty state", async () => {
    mockApi({
      "GET treatment/targets/": { rows: [], counts: { with_target: 0, within: 0, above: 0, retire: 0 }, reassess: [] },
    });
    render();
    expect(await screen.findByText("هنوز طرح مواجهه‌ای برای ریسک بالا یا بحرانی ثبت نشده است.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت ارزیابی پس از اقدام" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "مسیر امتیاز جاری به هدف" })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET treatment/targets/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
