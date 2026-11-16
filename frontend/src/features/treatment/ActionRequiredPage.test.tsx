import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { ActionRequiredPage as PageData, ActionRequiredRow, Level } from "@/lib/types";

import { ActionRequiredPage } from "./ActionRequiredPage";

const CRITICAL: Level = { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff" };
const HIGH: Level = { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#fff" };
const MEDIUM: Level = { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" };

function row(changes: Partial<ActionRequiredRow> & { key: string; id: number; code: string }): ActionRequiredRow {
  const { id, code, ...rest } = changes;
  return {
    kind: "plan",
    risk: { id, code, title: `سناریوی ${code}`, href: `/risks/${id}/`, note: "T1 · بانک الف" },
    level: HIGH,
    score: 12,
    owner: { id: 7, name: "رضا کاظمی" },
    option: { value: "reduce", label: "کاهش", suggested: true },
    reason: "بدون طرح مواجهه",
    deadline: { text: "۷ روز کاری", tone: "info", due: { iso: "2026-11-25", jalali: "1405/09/04" } },
    status: { label: "در تصمیم", tone: "info" },
    action: { kind: "create", label: "ایجاد طرح", href: `/actions/risks/${id}/plan/new/` },
    overdue: false,
    within_48h: false,
    containment_overdue: false,
    ...rest,
  };
}

function page(): PageData {
  return {
    rows: [
      row({
        key: "plan-1",
        id: 1,
        code: "RK-1405-0051",
        level: CRITICAL,
        score: 25,
        reason: "بدون طرح · مهلت مهار گذشته",
        deadline: { text: "۶ ساعت از مهلت گذشته", tone: "danger", due: null },
        status: { label: "عبور از مهلت", tone: "danger" },
        action: { kind: "escalate", label: "تصعید", href: null },
        overdue: true,
        containment_overdue: true,
        owner: { id: 8, name: "مهدی فرهادی" },
      }),
      row({ key: "plan-2", id: 2, code: "RK-1405-0054" }),
      row({
        key: "action-5",
        id: 3,
        code: "RK-1405-0039",
        kind: "failed",
        option: { value: "reduce", label: "کاهش", suggested: false },
        reason: "آزمون اقدام ناموفق · کنترل هنوز E2",
        deadline: { text: "بازسنجی ۱ روز کاری", tone: "warning", due: null },
        status: { label: "ناموفق", tone: "danger" },
        action: { kind: "open", label: "بازگشایی", href: "/actions/5/" },
        within_48h: true,
      }),
      row({
        key: "acceptance-9",
        id: 4,
        code: "RK-1405-0022",
        kind: "acceptance",
        level: MEDIUM,
        score: 8,
        option: { value: "accept", label: "پذیرش", suggested: false },
        reason: "انقضای پذیرش ۶ ماهه",
        deadline: { text: "۷ روز تا انقضا", tone: "danger", due: null },
        status: { label: "پذیرفته‌شده", tone: "success" },
        action: { kind: "open", label: "بازبینی", href: "/actions/acceptances/9/" },
      }),
    ],
    counts: { no_plan: 2, overdue: 1, within_48h: 1, failed: 1, acceptance: 1 },
    owners: [
      { id: 7, name: "رضا کاظمی" },
      { id: 8, name: "مهدی فرهادی" },
    ],
    containment_overdue: [{ id: 1, code: "RK-1405-0051", title: "حمله‌ی باج‌افزاری", href: "/risks/1/" }],
    can_escalate: true,
  };
}

function render() {
  return renderPage(<ActionRequiredPage />, { path: "/treatment/required", route: "/treatment/required" });
}

describe("ActionRequiredPage", () => {
  it("shows the containment alert, tiles, rows and next actions", async () => {
    mockApi({ "GET treatment/required/": page() });
    const { container } = render();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("۱ ریسک بحرانی از مهلت مهار ۲۴ ساعته عبور کرده‌اند");
    expect(within(alert).getByText("RK-1405-0051")).toBeInTheDocument();
    expect(screen.getByText("بدون طرح مواجهه", { selector: "span" })).toBeInTheDocument();

    const list = screen.getByRole("region", { name: "فهرست ریسک‌های نیازمند اقدام" });
    const rows = within(list).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByRole("button", { name: /تصعید\s*RK-1405-0051/ })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("link", { name: /ایجاد طرح\s*RK-1405-0054/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/risks/2/plan/new"),
    );
    expect(within(rows[2]!).getByRole("link", { name: /بازگشایی\s*RK-1405-0039/ })).toBeInTheDocument();
    expect(within(rows[3]!).getByText("پذیرفته‌شده")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("(پیشنهادی)", { exact: false })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("filters by tab, owner and overdue", async () => {
    const user = userEvent.setup();
    mockApi({ "GET treatment/required/": page() });
    render();

    const list = await screen.findByRole("region", { name: "فهرست ریسک‌های نیازمند اقدام" });
    const count = () => within(list).queryAllByRole("row").slice(1).length;
    await user.click(within(list).getByRole("tab", { name: /بازسنجی ناموفق/ }));
    expect(count()).toBe(1);
    await user.click(within(list).getByRole("tab", { name: /بالا/ }));
    expect(count()).toBe(2);
    await user.click(within(list).getByRole("tab", { name: /همه/ }));

    await user.click(within(list).getByRole("button", { name: "مالک" }));
    await user.click(screen.getByRole("radio", { name: "مهدی فرهادی" }));
    expect(count()).toBe(1);
    await user.click(screen.getByRole("radio", { name: "همه‌ی مالکان" }));
    await user.keyboard("{Escape}");

    await user.click(within(list).getByRole("button", { name: /فیلتر/ }));
    await user.click(screen.getByRole("checkbox", { name: "فقط کمتر از ۴۸ ساعت" }));
    expect(count()).toBe(1);
    expect(within(list).getByText("RK-1405-0039", { selector: "bdi" })).toBeInTheDocument();
  });

  it("escalates overdue critical risks after confirming", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET treatment/required/": page(),
      "POST treatment/required/escalate/": { message: "۱ ریسک به کمیته امنیت تصعید شد.", done: ["RK-1405-0051"] },
    });
    render();

    await user.click(await screen.findByRole("button", { name: "تصعید به کمیته امنیت" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("RK-1405-0051");
    await user.click(within(dialog).getByRole("button", { name: "تصعید" }));

    await waitFor(() => expect(api.callsTo("POST treatment/required/escalate/")[0]?.body).toEqual({ ids: [1] }));
    expect(await screen.findByText("۱ ریسک به کمیته امنیت تصعید شد.")).toBeInTheDocument();
  });

  it("lists the risks a plan can be created for, and shows errors", async () => {
    const user = userEvent.setup();
    mockApi({ "GET treatment/required/": page() });
    const first = render();
    await user.click(await screen.findByRole("button", { name: "ایجاد طرح مواجهه" }));
    expect(screen.getByRole("menuitem", { name: /RK-1405-0054/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /RK-1405-0051/ })).not.toBeInTheDocument();
    first.unmount();

    mockApi({ "GET treatment/required/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
