import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { InboxNotice, MonitoringInbox } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { MonitoringInboxPage } from "./MonitoringInboxPage";

function notice(id: number, extra: Partial<InboxNotice> = {}): InboxNotice {
  return {
    id,
    tab: "trigger",
    icon: "lightning",
    tone: "danger",
    title: `اعلان ${id}`,
    body: "شرح",
    chips: ["RK-1405-0001", "مالک: علی رضایی"],
    group: { key: "today", label: "امروز" },
    created: { iso: "2026-11-16T09:00:00+03:30", ago: "۲ ساعت پیش" },
    unread: true,
    mine: true,
    cta: { label: "آغاز بازسنجی", href: `/actions/reviews/${id}/`, icon: "flow", primary: true },
    ...extra,
  };
}

function inbox(changes: Partial<MonitoringInbox> = {}): MonitoringInbox {
  return {
    unread: 2,
    summary: {
      urgent: 1,
      urgent_days: 1,
      reviews: 4,
      review_days: 7,
      acceptances: 3,
      reminders: [30, 7],
      evidence: 5,
    },
    tabs: [
      { key: "all", label: "همه", count: 3 },
      { key: "trigger", label: "محرک‌ها", count: 1 },
      { key: "periodic", label: "بازبینی دوره‌ای", count: 1 },
      { key: "acceptance", label: "انقضای پذیرش", count: 1 },
      { key: "evidence", label: "شاهد", count: 0 },
    ],
    notices: [
      notice(1, { title: "رخداد مهم · RK-1405-0001" }),
      notice(2, {
        tab: "periodic",
        icon: "calendar",
        tone: "warning",
        title: "بازبینی هفتگی ریسک بحرانی RK-1405-0002",
        mine: false,
        cta: { label: "باز کردن ریسک", href: "/risks/2/", icon: "arrow-left", primary: false },
      }),
      notice(3, {
        tab: "acceptance",
        icon: "signature",
        tone: "info",
        title: "انقضای پذیرش AC-1405-0004 تا ۷ روز دیگر",
        unread: false,
        group: { key: "yesterday", label: "دیروز" },
        cta: { label: "بازبینی پذیرش", href: "/actions/acceptances/4/", icon: "signature", primary: false },
      }),
    ],
    calendar: [
      { rank: 4, name: "بحرانی", cycle: "هفتگی", count: 6, next: "۱۴۰۵/۰۸/۱۲", overdue: true },
      { rank: 1, name: "پایین", cycle: "شش‌ماهه", count: 2, next: "۱۴۰۵/۱۱/۰۱", overdue: false },
    ],
    triggers: [
      { key: "incident", label: "رخداد مهم یا بهره‌برداری فعال", rule: "ارجاع فوری؛ بازسنجی حداکثر ۱ روز کاری" },
    ],
    channels: { in_app: true, email: true, sms: true, delegate: false },
    ...changes,
  };
}

function render() {
  return renderPage(<MonitoringInboxPage />, { path: "/actions/notices", route: "/actions/notices" });
}

describe("MonitoringInboxPage", () => {
  it("groups notices by day with their action, and shows the calendar, triggers and channels", async () => {
    mockApi({ "GET monitoring/inbox/": inbox() });
    const { container } = render();

    const today = await screen.findByRole("list", { name: "اعلان‌های امروز" });
    const items = within(today).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("heading")).toHaveTextContent("خوانده‌نشده: رخداد مهم · RK-1405-0001");
    expect(within(items[0]!).getByRole("link", { name: /آغاز بازسنجی/ })).toHaveAttribute("href", "/actions/reviews/1");
    expect(screen.getByRole("list", { name: "اعلان‌های دیروز" })).toHaveTextContent("بازبینی پذیرش");
    expect(screen.getByText("۲ خوانده‌نشده")).toBeInTheDocument();
    expect(screen.getByText(/معوق از ۱۴۰۵\/۰۸\/۱۲/)).toBeInTheDocument();
    expect(screen.getByText("ارجاع فوری؛ بازسنجی حداکثر ۱ روز کاری")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "درون سامانه" })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it("filters by tab, by own notices and by unread", async () => {
    const user = userEvent.setup();
    mockApi({ "GET monitoring/inbox/": inbox() });
    render();

    await user.click(await screen.findByRole("tab", { name: /انقضای پذیرش/ }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: /همه/ }));
    await user.click(screen.getByRole("button", { name: "فقط من" }));
    expect(screen.queryByText("بازبینی هفتگی ریسک بحرانی RK-1405-0002")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "فقط نخوانده" }));
    expect(screen.queryByText(/AC-1405-0004/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
  });

  it("marks all as read and saves a channel", async () => {
    const user = userEvent.setup();
    const read = inbox({ unread: 0, notices: inbox().notices.map((item) => ({ ...item, unread: false })) });
    const api = mockApi({
      "GET monitoring/inbox/": inbox(),
      "POST monitoring/inbox/read/": { read: 2, page: read },
      "POST monitoring/channels/": { channels: { in_app: true, email: true, sms: false, delegate: false } },
    });
    render();

    await user.click(await screen.findByRole("button", { name: /همه خوانده شد/ }));
    await waitFor(() => expect(screen.queryByText("۲ خوانده‌نشده")).not.toBeInTheDocument());
    await user.click(screen.getByRole("switch", { name: "پیامک" }));
    await waitFor(() => expect(api.callsTo("POST monitoring/channels/")[0]?.body).toEqual({ sms: false }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "پیامک" })).not.toBeChecked());
  });

  it("shows an error state", async () => {
    mockApi({ "GET monitoring/inbox/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
