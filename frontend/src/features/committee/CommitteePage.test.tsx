import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { CommitteeMeeting } from "@/lib/types";
import { type ApiCall, mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { CommitteePage } from "./CommitteePage";

const critical = { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff" };
const high = { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000" };

function meeting(changes: Partial<CommitteeMeeting> = {}): CommitteeMeeting {
  return {
    id: 1,
    code: "MT-1405-0001",
    title: "جلسه‌ی کمیته‌ی امنیت · ۱۴۰۵/۰۸/۲۶",
    status: { value: "open", label: "در حال برگزاری" },
    subtitle: "جلسه‌ی فوق‌العاده به دلیل ریسک بحرانی RK-1405-0008 · دبیر: ندا احمدی (متولی روش)",
    stats: {
      agenda: { count: "۲", note: "۱ بحرانی · ۱ تغییر روش" },
      quorum: { present: "۵", total: "۷", met: true, note: "حد نصاب ۴ نفر · برقرار است" },
      previous: { count: "۳", note: "۱ مورد از مهلت گذشته", meeting: null },
      remaining: { value: "۴۵ دقیقه", note: "۰ مورد بررسی شد" },
    },
    attendees: [
      { id: 1, name: "رضا کریمی", line: "رئیس کمیته · معاون فناوری", state: "present", state_label: "حاضر" },
      {
        id: 2,
        name: "مریم صادقی",
        line: "مالک ریسک · بدون رأی در پرونده‌ی خود",
        state: "conflict",
        state_label: "تعارض منافع",
      },
      { id: 3, name: "علی رضایی", line: "مدیر عملیات", state: "absent", state_label: "غایب" },
    ],
    quorum: { text: "۵ از ۷ عضو حاضر · حد نصاب ۴", met: true },
    agenda: [
      {
        id: 11,
        number: 1,
        subject: "دسترسی ممتاز بدون کنترل",
        reference: "RK-1405-0008",
        href: "/risks/8/",
        level: critical,
        kind: "تصمیم مواجهه · فوری",
        owner: "مریم صادقی",
        status: { value: "review", label: "در حال بررسی" },
      },
      {
        id: 12,
        number: 2,
        subject: "تصویب ۳ تغییر روش",
        reference: "ParameterSet v6",
        href: null,
        level: null,
        kind: "تصویب روش‌شناختی",
        owner: "ندا احمدی",
        status: { value: "pending", label: "در انتظار" },
      },
    ],
    selected: {
      id: 11,
      subject: "دسترسی ممتاز بدون کنترل",
      kind: { value: "exposure", label: "تصمیم مواجهه · فوری" },
      status: { value: "review", label: "در حال بررسی" },
      owner: { id: 3, name: "مریم صادقی" },
      voters: 3,
      conflict: "مریم صادقی",
      options: [
        {
          id: 21,
          title: "کاهش + مهار فوری",
          description: "استقرار PAM",
          owner_proposal: true,
          chips: [
            { text: "هدف: بالا ۱۰", tone: "warning", level: high },
            { text: "هزینه: ۲٫۸ میلیارد ریال", tone: "neutral" },
          ],
        },
        { id: 22, title: "اجتناب", description: "قطع دسترسی", owner_proposal: false, chips: [] },
      ],
      decision: null,
      risk: { id: 8, code: "RK-1405-0008", href: "/risks/8/" },
      assessment: { code: "AS-1405-0010", href: "/assessments/10/", confidence: null },
      scenario: "SC-0007",
      score: "۱۸",
      level: critical,
      facts: [
        { label: "احتمال × پیامد", value: "L4 × I4" },
        { label: "رخداد مرتبط", value: "INC-20462 · در حال پاسخ" },
      ],
      policy: "سطح بحرانی: ارجاع فوری به کمیته امنیت.",
    },
    signatures: {
      item: 13,
      title: "مصوبه‌ی مورد ۲ · RK-1405-0009",
      rows: [
        { id: 1, name: "رضا کریمی", role: "رئیس کمیته", signed_at: "۱۰:۲۴", mine: false },
        { id: 2, name: "ندا احمدی", role: "دبیر", signed_at: null, mine: true },
      ],
      owner_note: true,
    },
    authority: [{ level: critical, rule: "ارجاع فوری به کمیته امنیت", deadline: "مهلت طرح: ۳ روز کاری" }],
    restricted: "مورد ۳ خارج از اختیار پذیرش عادی است.",
    minutes: [
      { number: 1, subject: "دسترسی ممتاز بدون کنترل", status: "در حال بررسی", text: null, votes: null },
      { number: 2, subject: "تصویب ۳ تغییر روش", status: "در انتظار", text: null, votes: null },
    ],
    can_run: true,
    candidates: [{ id: 30, code: "RK-1405-0017", title: "خرابی هم‌زمان مرکز داده" }],
    kinds: [
      { value: "exposure", label: "تصمیم مواجهه" },
      { value: "plan", label: "تأیید طرح" },
      { value: "method", label: "تصویب روش‌شناختی" },
    ],
    ...changes,
  };
}

function render(path = "/committee") {
  return renderPage(<CommitteePage />, { path, route: "/committee" });
}

describe("CommitteePage", () => {
  it("shows the agenda, the decision file, attendees, signatures and decision authority", async () => {
    mockApi({ "GET committee/meetings/current/": meeting() });
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: /جلسه‌ی کمیته‌ی امنیت/ })).toBeInTheDocument();
    const agenda = screen.getByRole("table", { name: /دستور جلسه/ });
    expect(within(agenda).getAllByRole("row")).toHaveLength(3);
    expect(within(agenda).getByRole("button", { name: "دسترسی ممتاز بدون کنترل" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(agenda).getByText("روش")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "پرونده‌ی تصمیم · دسترسی ممتاز بدون کنترل" })).toBeInTheDocument();
    expect(screen.getByText("INC-20462 · در حال پاسخ")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /کاهش \+ مهار فوری/ })).toBeChecked();
    expect(screen.getByText("پیشنهاد مالک")).toBeInTheDocument();
    expect(screen.getByText(/مالک ریسک در رأی‌گیری پرونده‌ی خود شرکت نمی‌کند/)).toBeInTheDocument();

    expect(screen.getByText("تعارض منافع")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /امضا/ })).toBeInTheDocument();
    expect(screen.getByText(/خارج از اختیار پذیرش عادی/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("records a resolution with the chosen option and the votes", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET committee/meetings/current/": meeting(),
      "POST committee/items/11/resolve/": meeting({ selected: { ...meeting().selected!, decision: null } }),
    });
    render();

    await user.click(await screen.findByRole("radio", { name: /اجتناب/ }));
    const infavor = screen.getByRole("spinbutton", { name: "موافق" });
    await user.clear(infavor);
    await user.type(infavor, "2");
    const against = screen.getByRole("spinbutton", { name: "مخالف" });
    await user.clear(against);
    await user.type(against, "1");
    await user.click(screen.getByRole("button", { name: /ثبت مصوبه/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("اجتناب با ۲ رأی موافق، ۱ مخالف و ۰ ممتنع");
    await user.click(within(dialog).getByRole("button", { name: "ثبت مصوبه" }));

    expect(api.callsTo("POST committee/items/11/resolve/")[0]?.body).toEqual({
      option: 22,
      votes: [2, 1, 0],
      text: "",
    });
  });

  it("blocks a resolution with more votes than voters", async () => {
    const user = userEvent.setup();
    mockApi({ "GET committee/meetings/current/": meeting() });
    render();

    const abstain = await screen.findByRole("spinbutton", { name: "ممتنع" });
    await user.clear(abstain);
    await user.type(abstain, "1");
    expect(screen.getByRole("button", { name: /ثبت مصوبه/ })).toBeDisabled();
  });

  it("defers with a reason and signs a resolution", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET committee/meetings/current/": meeting(),
      "POST committee/items/11/defer/": meeting(),
      "POST committee/items/13/sign/": meeting(),
    });
    render();

    await user.click(await screen.findByRole("button", { name: "ارجاع به جلسه‌ی بعد" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "ارجاع" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: /دلیل ارجاع/ }), "گزارش کامل نیست");
    await user.click(within(dialog).getByRole("button", { name: "ارجاع" }));
    expect(api.callsTo("POST committee/items/11/defer/")[0]?.body).toEqual({ reason: "گزارش کامل نیست" });

    await user.click(screen.getByRole("button", { name: /امضا/ }));
    expect(api.callsTo("POST committee/items/13/sign/")).toHaveLength(1);
  });

  it("selects another agenda item through the address", async () => {
    const user = userEvent.setup();
    const method = meeting({
      selected: {
        id: 12,
        subject: "تصویب ۳ تغییر روش",
        kind: { value: "method", label: "تصویب روش‌شناختی" },
        status: { value: "pending", label: "در انتظار" },
        owner: { id: 7, name: "ندا احمدی" },
        voters: 4,
        conflict: null,
        options: [],
        decision: null,
        risk: null,
        reference: "ParameterSet v6",
      },
    });
    mockApi({
      "GET committee/meetings/current/": (call: ApiCall) => (call.query.get("item") === "12" ? method : meeting()),
    });
    render();

    await user.click(await screen.findByRole("button", { name: "تصویب ۳ تغییر روش" }));
    expect(await screen.findByRole("heading", { name: "پرونده‌ی تصمیم · تصویب ۳ تغییر روش" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /شروع بررسی در جلسه/ })).toBeInTheDocument();
  });

  it("hides running controls from viewers and shows a closed meeting's minutes", async () => {
    const user = userEvent.setup();
    mockApi({
      "GET committee/meetings/current/": meeting({
        can_run: false,
        candidates: [],
        status: { value: "closed", label: "بسته‌شده" },
        minutes: [
          { number: 1, subject: "دسترسی ممتاز بدون کنترل", status: "مصوب شد", text: "اجتناب", votes: [3, 0, 0] },
        ],
      }),
    });
    render();

    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /بستن جلسه/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /افزودن مورد/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ثبت مصوبه/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /صورت‌جلسه/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("موافق ۳ · مخالف ۰ · ممتنع ۰");
  });

  it("closes the meeting after confirmation", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET committee/meetings/current/": meeting(),
      "POST committee/meetings/1/close/": meeting({ status: { value: "closed", label: "بسته‌شده" }, can_run: false }),
    });
    render();

    await user.click(await screen.findByRole("button", { name: /بستن جلسه و انتشار مصوبات/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("۲ مورد هنوز تصمیم ندارد");
    await user.click(within(dialog).getByRole("button", { name: "بستن جلسه" }));
    expect(api.callsTo("POST committee/meetings/1/close/")).toHaveLength(1);
    expect(await screen.findByText("بسته‌شده")).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET committee/meetings/current/": reply(404, { detail: "هنوز جلسه‌ای ثبت نشده" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
