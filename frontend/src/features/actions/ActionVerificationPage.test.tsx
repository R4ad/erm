import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ActionVerification } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { ActionVerificationPage } from "./ActionVerificationPage";

const high = { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000" };
const medium = { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" };

function sheet(changes: Partial<ActionVerification> = {}): ActionVerification {
  return {
    id: 9,
    code: "TR-1405-0009",
    title: "آزمون و تأیید نتیجه · مانور بازیابی",
    status: { value: "ready", label: "آماده‌ی آزمون" },
    subtitle: "اقدام TR-1405-0009 · ریسک RK-1405-0007 · مالک اقدام: علی رضایی",
    risk: { code: "RK-1405-0007", href: "/risks/7/" },
    action_href: "/actions/9/",
    steps: [
      { value: "planned", label: "برنامه‌ریزی", state: "done" },
      { value: "approved", label: "مصوب", state: "done" },
      { value: "in_progress", label: "در اجرا", state: "done" },
      { value: "ready", label: "آماده‌ی آزمون", state: "current" },
      { value: "verified", label: "تأییدشده", state: "upcoming" },
    ],
    side: {
      items: [
        { value: "blocked", label: "مسدود", active: false },
        { value: "failed", label: "ناموفق", active: false },
      ],
      note: "اجرای ۱ در ۱۴۰۵/۰۸/۱۰ ناموفق بود و اقدام به «در اجرا» برگشت",
    },
    report: { code: "EV-1405-0022", href: "/risks/evidence/22/" },
    criteria: {
      summary: "۲ از ۲ معیار دامنه",
      met: true,
      rows: [
        {
          id: 1,
          title: "زمان بازیابی",
          target: "حداکثر ۴ ساعت",
          result: "۲ ساعت",
          status: { value: "passed", label: "قبول", tone: "success" },
        },
        {
          id: 2,
          title: "پایگاه داده‌ی گزارش‌گیری",
          target: "—",
          result: "آزموده نشد",
          status: { value: "out_of_scope", label: "خارج از دامنه", tone: "neutral" },
        },
      ],
      notes: ["در دامنه‌ی این اقدام نبود."],
      text: "بازیابی کامل",
    },
    runs: {
      setting: "مانور در پنجره‌ی تغییر شبانه",
      rows: [
        {
          id: 2,
          number: 2,
          title: "اجرای ۲ · ۱۴۰۵/۰۸/۲۲",
          passed: true,
          outcome: "موفق · ۲ ساعت",
          description: "اسکریپت اصلاح‌شده",
          evidence: { code: "EV-1405-0022", href: "/risks/evidence/22/" },
        },
        {
          id: 1,
          number: 1,
          title: "اجرای ۱ · ۱۴۰۵/۰۸/۱۰",
          passed: false,
          outcome: "ناموفق · ۶ ساعت",
          description: "جدول‌های تسویه پوشش داده نشد",
          evidence: null,
        },
      ],
    },
    people: {
      sod: true,
      rows: [
        { label: "تأییدکننده‌ی نتیجه", value: "کاوه رحیمی · ممیزی داخلی" },
        { label: "مجری", value: "مهدی فرهادی" },
      ],
    },
    decision: {
      can_decide: true,
      options: [
        { value: "verify", label: "تأییدشده — معیارهای دامنه‌ی اقدام محقق شد", problems: [] },
        { value: "fail", label: "ناموفق — بازگشت به «در اجرا» با اقدام اصلاحی", problems: [] },
      ],
      follow_up: "ایجاد اقدام پیگیری برای پایگاه داده‌ی گزارش‌گیری",
      closing: "اقدام پس از تأیید خروجی بسته می‌شود؛ ریسک بسته نمی‌شود.",
      submit: "ثبت تأیید و آغاز ارزیابی پس از اقدام",
      waiting: null,
      last: null,
    },
    evidence: [
      {
        id: 22,
        code: "EV-1405-0022",
        title: "لاگ زمان‌بندی مانور",
        observed_on: "۱۴۰۵/۰۸/۲۲",
        href: "/risks/evidence/22/",
      },
    ],
    effect: {
      title: "اثر بر ریسک RK-1405-0007",
      subtitle: "خرابی پایگاه داده",
      before: { title: "جاری قبلی", hint: "AS-1405-0009", l: 5, i: 3, score: "۱۵", level: high },
      after: { title: "جاری جدید (پس از تأیید)", hint: "برآورد طرح", l: 3, i: 2, score: "۶", level: medium },
      rows: [
        { label: "زمان بازیابی", before: "۹ ساعت", after: "۲ ساعت" },
        { label: "احتمال L", before: "۵", after: "۳" },
      ],
      profile: [],
      changed: null,
      note: "ریسک هدف طرح با تأیید این اقدام محقق می‌شود.",
      reached: true,
    },
    ...changes,
  };
}

function render() {
  return renderPage(<ActionVerificationPage />, { path: "/actions/9/verify", route: "/actions/:pk/verify" });
}

describe("ActionVerificationPage", () => {
  it("shows steps, criteria, runs, the independent verifier and the effect on the risk", async () => {
    mockApi({ "GET actions/9/verification/": sheet() });
    const { container } = render();

    expect(
      await screen.findByRole("heading", { level: 1, name: "آزمون و تأیید نتیجه · مانور بازیابی" }),
    ).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "گام‌های اقدام" });
    expect(within(steps).getAllByRole("listitem")[3]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/ناموفق بود و اقدام به «در اجرا» برگشت/)).toBeInTheDocument();

    const criteria = screen.getByRole("table", { name: /معیارهای پذیرش/ });
    expect(within(criteria).getAllByRole("row")).toHaveLength(3);
    expect(within(criteria).getByText("خارج از دامنه")).toBeInTheDocument();
    expect(screen.getByText("۲ از ۲ معیار دامنه")).toBeInTheDocument();
    expect(screen.getByText("موفق · ۲ ساعت")).toBeInTheDocument();
    expect(screen.getByText("SoD برقرار")).toBeInTheDocument();

    const after = screen.getByRole("region", { name: "جاری جدید (پس از تأیید)" });
    expect(within(after).getByText("۶")).toBeInTheDocument();
    expect(within(after).getByText("۲ ساعت")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ثبت تأیید نتیجه/ })).toHaveAttribute("href", "#decision");
    await expectNoAxeViolations(container);
  });

  it("records the verifier's decision with a follow-up action", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET actions/9/verification/": sheet(),
      "POST actions/9/verification/": sheet({
        status: { value: "verified", label: "تأییدشده" },
        decision: {
          ...sheet().decision,
          can_decide: false,
          last: { label: "تأییدشده", tone: "success", by: "کاوه رحیمی", at: null, note: "تأیید شد" },
        },
        result: { follow_ups: [{ code: "TR-1405-0020", href: "/actions/20/" }], notified: 2 },
      }),
    });
    render();

    const submit = await screen.findByRole("button", { name: "ثبت تأیید و آغاز ارزیابی پس از اقدام" });
    expect(submit).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /ایجاد اقدام پیگیری/ })).toBeChecked();
    await user.type(screen.getByRole("textbox", { name: /توضیح تأییدکننده/ }), "دو اجرای مستقل");
    await user.click(submit);

    expect(api.callsTo("POST actions/9/verification/")[0]?.body).toEqual({
      decision: "verify",
      note: "دو اجرای مستقل",
      follow_up: true,
    });
    expect(await screen.findByText("تأیید شد")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ثبت تأیید و آغاز/ })).not.toBeInTheDocument();
  });

  it("records a failure without a follow-up", async () => {
    const user = userEvent.setup();
    const api = mockApi({ "GET actions/9/verification/": sheet(), "POST actions/9/verification/": sheet() });
    render();

    await user.click(await screen.findByRole("radio", { name: /ناموفق/ }));
    expect(screen.queryByRole("checkbox", { name: /ایجاد اقدام پیگیری/ })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /توضیح تأییدکننده/ }), "زمان گذشت");
    await user.click(screen.getByRole("button", { name: /ثبت نتیجه‌ی ناموفق/ }));
    expect(api.callsTo("POST actions/9/verification/")[0]?.body).toEqual({
      decision: "fail",
      note: "زمان گذشت",
      follow_up: false,
    });
  });

  it("disables verification while criteria are unmet and waits for the verifier otherwise", async () => {
    const blocked = sheet({
      decision: {
        ...sheet().decision,
        options: [
          { value: "verify", label: "تأییدشده", problems: ["۱ معیار دامنه‌ی اقدام هنوز قبول نشده است"] },
          { value: "fail", label: "ناموفق", problems: [] },
        ],
      },
    });
    mockApi({ "GET actions/9/verification/": blocked });
    const first = render();
    expect(await screen.findByRole("radio", { name: /تأییدشده/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /ناموفق/ })).toBeChecked();
    expect(screen.getByText("۱ معیار دامنه‌ی اقدام هنوز قبول نشده است")).toBeInTheDocument();
    first.unmount();

    mockApi({
      "GET actions/9/verification/": sheet({
        decision: { ...sheet().decision, can_decide: false, waiting: "در انتظار تصمیم کاوه رحیمی" },
      }),
    });
    render();
    expect(await screen.findByText("در انتظار تصمیم کاوه رحیمی")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ثبت تأیید نتیجه/ })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET actions/9/verification/": reply(404, { detail: "پیدا نشد" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
