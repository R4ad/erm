import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { MethodDiff } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { MethodDiffPage } from "./MethodDiffPage";

function sheet(changes: Partial<MethodDiff> = {}): MethodDiff {
  return {
    title: "مقایسه‌ی ParameterSet v2 با v1",
    subtitle: "۲ پارامتر تغییر کرده و بقیه بدون تغییرند",
    version: {
      number: 2,
      name: "v2",
      chip: { label: "پیش‌نویس · در دست ویرایش", tone: "neutral" },
      note: "پیش‌نویس · سارا محمدی",
      hint: "تاریخ اجرای پیشنهادی ۱۴۰۵/۰۹/۱۰",
    },
    base: { number: 1, name: "v1", note: "نسخه‌ی جاری", hint: "۲۳ ارزیابی فعال با این نسخه" },
    rows: [
      {
        key: "ranges",
        label: "آستانه‌های سطح",
        before: "پایین ۱–۴",
        after: "همان",
        changed: false,
        status: { label: "بدون تغییر", tone: "neutral" },
      },
      {
        key: "coverage",
        label: "پوشش ثبت داده‌ی آغازگر",
        before: "حداقل ۹۵٪",
        after: "حداقل ۹۸٪",
        changed: true,
        status: { label: "سخت‌گیرانه‌تر", tone: "warning" },
      },
    ],
    changed: 1,
    simulation: {
      count: 15,
      subtitle: "اجرای v2 روی ۱۵ ارزیابی جاری بدون تغییر رکوردها",
      tiles: [
        { key: "count", label: "ارزیابی شبیه‌سازی‌شده", value: 15, note: "همه‌ی ارزیابی‌های فعال" },
        { key: "data", label: "نیازمند داده‌ی بیشتر", value: 1, note: "پوشش ثبت بین ۹۵ و ۹۸٪" },
        { key: "levels", label: "تغییر سطح ریسک", value: 0, note: "آستانه‌ها ثابت مانده‌اند" },
        { key: "review", label: "بازبینی زودتر", value: 0, note: "دوره‌های بازبینی کوتاه نشده‌اند" },
      ],
      reminders: 0,
      rows: [
        {
          assessment: { code: "AS-1405-0058", href: "/assessments/58/" },
          risk: { code: "RK-1405-0001", title: "خرابی ذخیره‌ساز پشتیبان", href: "/risks/1/" },
          effect: "پوشش ثبت ۹۶٪ کمتر از ۹۸٪",
          action: "اطمینان A به کم می‌رسد؛ داده‌ی بیشتر جمع‌آوری شود",
        },
      ],
    },
    last_run: null,
    notes: {
      author: "سارا محمدی",
      date: "۱۴۰۵/۰۸/۲۵",
      text: "هم‌ترازی با بخش کفایت داده",
      groups: ["پارامترهای پایه"],
    },
    steps: [
      { key: "draft", title: "پیشنهاد متولی روش", note: "متولی روش", state: "current" },
      { key: "simulation", title: "شبیه‌سازی اثر", note: "اجرای نسخه", state: "locked" },
    ],
    rules: ["هر ارزیابی شناسه‌ی نسخه‌ی پارامتر خود را نگه می‌دارد"],
    can_submit: true,
    can_simulate: true,
    definition: "/method/2",
    ...changes,
  };
}

function render() {
  return renderPage(<MethodDiffPage />, { path: "/method/2/diff", route: "/method/:number/diff" });
}

describe("MethodDiffPage", () => {
  it("compares the parameters and filters to the changed ones", async () => {
    const user = userEvent.setup();
    mockApi({ "GET method/definition/2/diff/": sheet() });
    const { container } = render();

    expect(
      await screen.findByRole("heading", { level: 1, name: "مقایسه‌ی ParameterSet v2 با v1" }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /تفاوت پارامترهای v2 با v1/ });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("سخت‌گیرانه‌تر")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: /فقط تغییرات/ }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).queryByText("آستانه‌های سطح")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /فقط تغییرات/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the simulated effect and records a new run", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET method/definition/2/diff/": sheet(),
      "POST method/definition/2/diff/": sheet({ last_run: { at: "۱۴۰۵/۰۸/۲۶", by: "سارا محمدی" } }),
    });
    render();

    const effects = await screen.findByRole("table", { name: /ارزیابی‌هایی که نسخه‌ی v2/ });
    expect(within(effects).getByText("پوشش ثبت ۹۶٪ کمتر از ۹۸٪")).toBeInTheDocument();
    expect(screen.getByText("نیازمند داده‌ی بیشتر")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /اجرای دوباره/ }));
    expect(api.callsTo("POST method/definition/2/diff/")).toHaveLength(1);
    expect(await screen.findByText(/آخرین اجرای ثبت‌شده: ۱۴۰۵\/۰۸\/۲۶/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /خروجی مقایسه/ })).toHaveAttribute(
      "href",
      "/api/method/definition/2/diff/?export=csv",
    );
  });

  it("submits the draft for approval with its change notes", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET method/definition/2/diff/": sheet(),
      "POST method/definition/2/submit/": {},
    });
    render();

    await user.click(await screen.findByRole("button", { name: "ارسال برای تصویب" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "ارسال برای تصویب" }));
    expect(api.callsTo("POST method/definition/2/submit/")[0]?.body).toEqual({
      change_notes: "هم‌ترازی با بخش کفایت داده",
    });
  });

  it("hides the owner's actions from other readers", async () => {
    mockApi({ "GET method/definition/2/diff/": sheet({ can_submit: false, can_simulate: false }) });
    render();
    expect(await screen.findByText("یادداشت تغییر")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ارسال برای تصویب" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /اجرای دوباره/ })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET method/definition/2/diff/": reply(404, { detail: "پیدا نشد" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
