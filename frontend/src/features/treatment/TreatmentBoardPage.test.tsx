import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { BoardCard, Level, TreatmentBoardPage as PageData } from "@/lib/types";

import { TreatmentBoardPage } from "./TreatmentBoardPage";

const HIGH: Level = { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#fff" };
const MEDIUM: Level = { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" };

const COLUMNS = [
  ["planned", "برنامه‌ریزی"],
  ["approved", "مصوب"],
  ["in_progress", "در اجرا"],
  ["blocked", "مسدود"],
  ["ready", "آماده‌ی آزمون"],
  ["verified", "تأییدشده"],
  ["failed", "ناموفق"],
].map(([value, label]) => ({ value: value!, label: label! }));

function card(id: number, status: string, changes: Partial<BoardCard> = {}): BoardCard {
  const label = COLUMNS.find((column) => column.value === status)?.label ?? status;
  return {
    id,
    code: `TR-1405-00${id}`,
    title: `اقدام ${id}`,
    href: `/actions/${id}/`,
    status: { value: status, label },
    level: HIGH,
    risk: { id: 1, code: "RK-1405-0007", title: "ریسک", href: "/risks/1/" },
    note: "۱۵ ← ۷",
    assignee: { id: 5, name: "مهدی فرهادی" },
    owner_id: 9,
    verifier_id: 6,
    due: { iso: "2026-12-01", jalali: "1405/09/10" },
    overdue: false,
    progress: 40,
    footer: { text: "۰۹/۱۰", tone: "neutral", icon: "clock" },
    alert: false,
    ...changes,
  };
}

function page(): PageData {
  return {
    columns: COLUMNS,
    cards: [
      card(1, "planned"),
      card(2, "in_progress", { assignee: { id: 7, name: "سارا محمدی" }, owner_id: 7 }),
      card(3, "blocked", {
        note: "منتظر بودجه",
        overdue: true,
        alert: true,
        footer: { text: "معوق", tone: "danger", icon: "warning" },
        level: MEDIUM,
        risk: { id: 2, code: "RK-1405-0022", title: "ریسک دوم", href: "/risks/2/" },
      }),
      card(4, "verified", { progress: 100, footer: { text: "تأیید ۰۸/۲۱", tone: "success", icon: "check-circle" } }),
    ],
    counts: { active: 3, blocked: 1, ready: 0, verified: 1, reviews: 1 },
    blocked_note: "منتظر بودجه",
    reviews: [
      {
        key: "review-1",
        risk: { code: "RK-1405-0007", title: "از دست رفتن داده", href: "/risks/1/" },
        note: "بازبینی دوره‌ای · ارزیابی پس از اقدام",
        current: 15,
        target: 7,
        due: { iso: "2026-11-21", jalali: "1405/08/30" },
        responsible: { id: 3, name: "علی رضایی" },
        notice: { text: "ارسال شد · ۷ روز", tone: "success" },
        href: "/actions/reviews/1/",
      },
    ],
    creatable: [{ code: "RK-1405-0004", title: "قطع خدمت تأمین‌کننده", href: "/actions/risks/4/plan/new/" }],
    can_create: true,
    me: 7,
  };
}

function render() {
  return renderPage(<TreatmentBoardPage />, { path: "/treatment/board", route: "/treatment/board" });
}

describe("TreatmentBoardPage", () => {
  it("shows tiles, a column per status and upcoming reassessments", async () => {
    mockApi({ "GET treatment/board/": page() });
    const { container } = render();

    const board = await screen.findByRole("region", { name: "تابلوی اقدام‌ها، پیمایش افقی" });
    expect(within(board).getAllByRole("region")).toHaveLength(7);
    const blocked = within(board).getByRole("region", { name: "مسدود، ۱ اقدام" });
    expect(within(blocked).getByText("منتظر بودجه")).toBeInTheDocument();
    expect(within(blocked).getByText("معوق")).toBeInTheDocument();
    expect(within(board).getByRole("region", { name: "تأییدشده، ۱ اقدام" })).toHaveTextContent("تأیید ۰۸/۲۱");
    expect(within(board).getByRole("meter", { name: "زمان سپری‌شده از برنامه‌ی TR-1405-001" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(screen.getByText("طرح‌های فعال").closest("div")?.parentElement).toHaveTextContent("۳");

    const reviews = screen.getByRole("region", { name: "بازسنجی‌های پیش رو" });
    expect(within(reviews).getByText("از دست رفتن داده")).toBeInTheDocument();
    expect(within(reviews).getByText("ارسال شد · ۷ روز")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "چرخه‌ی وضعیت طرح" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("filters by tab and groups by risk", async () => {
    const user = userEvent.setup();
    mockApi({ "GET treatment/board/": page() });
    render();

    await screen.findByRole("region", { name: "تابلوی اقدام‌ها، پیمایش افقی" });
    await user.click(screen.getByRole("tab", { name: /طرح‌های من/ }));
    expect(screen.getAllByRole("listitem").filter((item) => item.textContent?.includes("TR-1405-00"))).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: /معوق/ }));
    expect(screen.getByText("TR-1405-003")).toBeInTheDocument();
    expect(screen.queryByText("TR-1405-001")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /همه‌ی طرح‌ها/ }));

    await user.selectOptions(screen.getByRole("combobox", { name: "گروه‌بندی" }), "risk");
    const grouped = screen.getByRole("region", { name: "تابلوی اقدام‌ها، پیمایش افقی" });
    expect(
      within(grouped)
        .getAllByRole("region")
        .map((lane) => lane.getAttribute("aria-label")),
    ).toEqual(["RK-1405-0007، ۳ اقدام", "RK-1405-0022، ۱ اقدام"]);
  });

  it("switches to the table view and lists risks needing a plan", async () => {
    const user = userEvent.setup();
    mockApi({ "GET treatment/board/": page() });
    render();

    await user.click(await screen.findByRole("button", { name: "نمای جدول" }));
    const table = screen.getByRole("table", { name: "اقدام‌های طرح‌های مواجهه" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "نمای تابلو" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "طرح مواجهه‌ی جدید" }));
    expect(screen.getByRole("menuitem", { name: /RK-1405-0004/ })).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET treatment/board/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
