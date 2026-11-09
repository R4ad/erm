import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { deferred, mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  acceptanceDetail,
  acceptanceList,
  actionDetail,
  actionList,
  planDetail,
  reassessmentForm,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { AcceptanceDetailPage } from "./AcceptanceDetailPage";
import { ActionDetailPage } from "./ActionDetailPage";
import { AcceptanceListPage, ActionListPage } from "./ListPages";
import { PlanDetailPage } from "./PlanDetailPage";
import { ReassessmentPage } from "./ReassessmentPage";

const done = { message: "انجام شد.", redirect: null };

function pageAt(djangoPath: string, data: unknown, post: unknown = done) {
  return mockApi({
    // فیلترها در query همان نشانی جنگو می‌آیند و جواب همان صفحه است.
    "GET pages/": (call: ApiCall) => (call.query.get("path")?.split("?")[0] === djangoPath ? data : reply(404, {})),
    "POST forms/": post,
  });
}

const sent = (api: ReturnType<typeof mockApi>) =>
  api.callsTo("POST forms/").map((call) => ({ path: call.query.get("path"), body: call.body }));

describe("ActionListPage", () => {
  it("lists the actions with their risk, owner, deadline and an overdue badge", async () => {
    pageAt("/actions/", actionList());
    renderPage(<ActionListPage />, { path: "/actions" });
    const table = await screen.findByRole("table", { name: "اقدام‌ها" });
    expect(within(table).getByRole("link", { name: "اقدام آزمون پوشش دسترسی ممتاز" })).toHaveAttribute(
      "href",
      "/actions/1",
    );
    const late = within(table).getByRole("link", { name: "اقدام آزمون عقب‌افتاده" }).closest("tr")!;
    expect(within(late).getByText("RK-1405-0002")).toBeInTheDocument();
    expect(within(late).getByText("عقب‌افتاده")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "کارهای من" })).toHaveAttribute("href", "/");
    await expectNoAxeViolations();
  });

  it("keeps the Django checkbox filters in the URL and shows them as removable chips", async () => {
    const api = pageAt("/actions/", actionList());
    const { user } = renderPage(<ActionListPage />, { path: "/actions" });
    const overdue = await screen.findByRole("checkbox", { name: "فقط عقب‌افتاده" });
    await user.click(overdue);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/actions?overdue=on"));
    expect(overdue).toBeChecked();
    await waitFor(() =>
      expect(api.callsTo("GET pages/").some((call) => call.query.get("path") === "/actions/?overdue=on")).toBe(true),
    );
    const chips = screen.getByRole("list", { name: "فیلترهای فعال" });
    await user.click(within(chips).getByRole("button", { name: "برداشتن فیلتر فقط عقب‌افتاده" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/actions$/));
  });
});

describe("AcceptanceListPage", () => {
  it("shows each acceptance with its risk, level, validity and state", async () => {
    pageAt("/actions/acceptances/", acceptanceList());
    renderPage(<AcceptanceListPage />, { path: "/actions/acceptances" });
    const table = await screen.findByRole("table", { name: "پذیرش‌های ریسک" });
    const expired = within(table).getByRole("link", { name: "پذیرش AC-1405-0003" }).closest("tr")!;
    expect(expired).toHaveTextContent("منقضی");
    expect(within(expired).getByRole("link", { name: "RK-1405-0004" })).toHaveAttribute("href", "/risks/4");
    expect(within(table).getByRole("link", { name: "پذیرش AC-1405-0002" })).toHaveAttribute(
      "href",
      "/actions/acceptances/2",
    );
    await expectNoAxeViolations();
  });
});

describe("PlanDetailPage", () => {
  it("shows the plan with its base and target assessments and lets the owner approve it after a confirmation", async () => {
    const answer = deferred();
    const api = pageAt("/actions/plans/1/", planDetail(), answer.promise);
    const { user } = renderPage(<PlanDetailPage />, { path: "/actions/plans/1", route: "/actions/plans/:pk" });
    expect(await screen.findByRole("heading", { name: "طرح مواجهه: کاهش", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("منتظر تأیید مالک")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AS-1405-0002" })).toHaveAttribute("href", "/assessments/2");
    expect(screen.getByText(/برای این سطح طرح مواجهه الزامی است/)).toBeInTheDocument();

    const actions = screen.getByRole("region", { name: "اقدام‌ها" });
    expect(within(actions).getByRole("link", { name: "اقدام تازه" })).toHaveAttribute(
      "href",
      "/actions/plans/1/actions/new",
    );
    expect(within(actions).getByText("برنامه‌ریزی")).toBeInTheDocument();
    const acceptances = screen.getByRole("region", { name: "پذیرش" });
    expect(within(acceptances).getByRole("link", { name: "پذیرش زمان‌دار" })).toHaveAttribute(
      "href",
      "/actions/risks/1/acceptance/new",
    );
    await expectNoAxeViolations();

    const approval = screen.getByRole("region", { name: "تأیید مالک ریسک" });
    await user.click(within(approval).getByRole("button", { name: "تأیید طرح" }));
    const dialog = await screen.findByRole("alertdialog", { name: /تأیید شود؟/ });
    expect(api.callsTo("POST forms/")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "تأیید طرح" }));
    await waitFor(() => expect(sent(api)).toEqual([{ path: "/actions/plans/1/approve/", body: { values: {} } }]));
    expect(within(approval).getByRole("button", { name: /تأیید طرح/ })).toHaveAttribute("aria-busy", "true");
    answer.resolve({ message: "طرح تأیید شد.", redirect: { href: "/actions/plans/1/", route: "/actions/plans/1" } });
    expect(await screen.findByText("طرح تأیید شد.", { exact: true })).toBeInTheDocument();
  });

  it("lists what is missing before approval and tells others that the owner approves", async () => {
    pageAt(
      "/actions/plans/1/",
      planDetail({
        approval: {
          problems: ["دست‌کم یک اقدام لازم است."],
          approve_url: null,
          message: "",
          waiting_for_owner: false,
        },
        actions: [],
        add_action_url: null,
        edit_url: null,
      }),
    );
    renderPage(<PlanDetailPage />, { path: "/actions/plans/1", route: "/actions/plans/:pk" });
    const approval = await screen.findByRole("region", { name: "تأیید مالک ریسک" });
    expect(approval).toHaveTextContent("پیش از تأیید مالک ریسک لازم است:");
    expect(approval).toHaveTextContent("دست‌کم یک اقدام لازم است.");
    expect(within(approval).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("هنوز اقدامی ثبت نشده است.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ویرایش" })).not.toBeInTheDocument();
  });

  it("shows the reassessment comparison when a new current assessment is approved", async () => {
    const comparison = reassessmentForm().comparison!;
    pageAt(
      "/actions/plans/1/",
      planDetail({
        plan: { ...planDetail().plan, state: { value: "approved", label: "تأییدشده‌ی مالک" } },
        approval: { problems: [], approve_url: null, message: "", waiting_for_owner: false },
        reassess_url: "/actions/plans/1/reassess/",
        comparison,
      }),
    );
    renderPage(<PlanDetailPage />, { path: "/actions/plans/1", route: "/actions/plans/:pk" });
    const section = await screen.findByRole("region", { name: "بازسنجی" });
    expect(within(section).getByRole("link", { name: "ثبت بازسنجی" })).toHaveAttribute(
      "href",
      "/actions/plans/1/reassess",
    );
    const table = within(section).getByRole("table", { name: /مقایسه‌ی ارزیابی مبنا، تازه و هدف/ });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "تأیید مالک ریسک" })).not.toBeInTheDocument();
  });
});

describe("ActionDetailPage", () => {
  it("records a move with the note and the evidence through the Django view", async () => {
    const api = pageAt("/actions/1/", actionDetail());
    const { user } = renderPage(<ActionDetailPage />, { path: "/actions/1", route: "/actions/:pk" });
    expect(await screen.findByRole("heading", { name: "اقدام آزمون پوشش دسترسی ممتاز", level: 1 })).toBeInTheDocument();
    const facts = screen.getByRole("complementary", { name: "مشخصات اقدام" });
    expect(facts).toHaveTextContent("تأییدکننده‌ی آزمون");
    expect(facts).toHaveTextContent("۱٬۵۰۰٬۰۰۰ ریال، ۴۰ نفرساعت");
    const history = screen.getByRole("list", { name: "سابقه‌ی پیشرفت اقدام" });
    expect(within(history).getAllByRole("listitem")[0]).toHaveTextContent("شروع شد");
    await expectNoAxeViolations();

    const progress = screen.getByRole("region", { name: "پیشرفت" });
    expect(progress).toHaveTextContent("برای «مسدود است» توضیح لازم است.");
    await user.type(within(progress).getByRole("textbox", { name: "توضیح" }), "اجرا شد");
    await user.click(within(progress).getByRole("checkbox", { name: /EV-1405-0007/ }));
    await user.click(within(progress).getByRole("button", { name: "آماده‌ی آزمون" }));
    await waitFor(() =>
      expect(sent(api)).toEqual([
        { path: "/actions/1/move/", body: { values: { move: "ready", note: "اجرا شد", evidence: ["7"] } } },
      ]),
    );
    await waitFor(() => expect(within(progress).getByRole("textbox", { name: "توضیح" })).toHaveValue(""));
  });

  it("shows the Django message when a move is refused", async () => {
    const api = pageAt(
      "/actions/1/",
      actionDetail(),
      reply(400, { message: "برای «مسدود است» توضیح لازم است.", redirect: { href: "/actions/1/#progress" } }),
    );
    const { user } = renderPage(<ActionDetailPage />, { path: "/actions/1", route: "/actions/:pk" });
    const progress = await screen.findByRole("region", { name: "پیشرفت" });
    await user.click(within(progress).getByRole("button", { name: "مسدود است" }));
    expect(await within(progress).findByRole("alert")).toHaveTextContent("برای «مسدود است» توضیح لازم است.");
    expect(sent(api)[0]?.body).toEqual({ values: { move: "block", note: "", evidence: [] } });
  });

  it("explains why nothing can be recorded yet and hides the risk from people who cannot see it", async () => {
    pageAt(
      "/actions/1/",
      actionDetail({
        progress: { state: "waiting" },
        risk: { id: 1, code: "RK-1405-0001", title: "ریسک آزمون شماره‌ی ۱", href: null },
        plan: { option: "کاهش", href: null },
        edit_url: null,
      }),
    );
    renderPage(<ActionDetailPage />, { path: "/actions/1", route: "/actions/:pk" });
    const progress = await screen.findByRole("region", { name: "پیشرفت" });
    expect(progress).toHaveTextContent("اجرا وقتی ثبت می‌شود که ریسک «در اجرای درمان» باشد.");
    expect(within(progress).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /RK-1405-0001/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "طرح مواجهه" })).not.toBeInTheDocument();
  });
});

describe("AcceptanceDetailPage", () => {
  it("signs as senior management with the letter file sent as multipart", async () => {
    const api = pageAt("/actions/acceptances/2/", acceptanceDetail());
    const { user } = renderPage(<AcceptanceDetailPage />, {
      path: "/actions/acceptances/2",
      route: "/actions/acceptances/:pk",
    });
    expect(await screen.findByRole("heading", { name: "پذیرش AC-1405-0002", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("عبور از حد تحمل مشتری اختیار پذیرش عمومی را محدود کرده است.")).toBeInTheDocument();
    const signatures = screen.getByRole("list", { name: "امضاهای لازم" });
    const rows = within(signatures).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("تأیید");
    expect(rows[1]).toHaveTextContent("مدیران واحد «واحد آزمون»: مدیر آزمون");
    expect(rows[2]).toHaveTextContent("منتظر");
    await expectNoAxeViolations();

    const box = screen.getByRole("region", { name: "امضای شما به‌عنوان مدیریت ارشد" });
    expect(box).toHaveTextContent("تصمیم مدیریت ارشد را از روی نامه‌ی رسمی ثبت می‌کنید.");
    await user.type(within(box).getByRole("textbox", { name: "شماره‌ی نامه" }), "۱۲/۳۴۵");
    const letter = new File(["%PDF-1.4"], "letter.pdf", { type: "application/pdf" });
    await user.upload(within(box).getByLabelText("فایل نامه"), letter);
    await user.click(within(box).getByRole("button", { name: "تأیید پذیرش" }));
    const dialog = await screen.findByRole("alertdialog", { name: "پذیرش AC-1405-0002 را تأیید می‌کنید؟" });
    await user.click(within(dialog).getByRole("button", { name: "تأیید پذیرش" }));
    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    const call = api.callsTo("POST forms/")[0]!;
    expect(call.query.get("path")).toBe("/actions/acceptances/2/sign/");
    const body = call.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("authority")).toBe("senior_management");
    expect(body.get("decision")).toBe("approve");
    expect(body.get("reference")).toBe("۱۲/۳۴۵");
    expect((body.get("letter") as File).name).toBe("letter.pdf");
  });

  it("revokes with a reason after a confirmation", async () => {
    const api = pageAt("/actions/acceptances/2/", acceptanceDetail({ sign_forms: [] }));
    const { user } = renderPage(<AcceptanceDetailPage />, {
      path: "/actions/acceptances/2",
      route: "/actions/acceptances/:pk",
    });
    await user.click(await screen.findByText("لغو پذیرش"));
    await user.type(screen.getByRole("textbox", { name: /دلیل لغو/ }), "رخداد تازه");
    await user.click(screen.getByRole("button", { name: "لغو" }));
    const dialog = await screen.findByRole("alertdialog", { name: "پذیرش AC-1405-0002 لغو شود؟" });
    await user.click(within(dialog).getByRole("button", { name: "لغو پذیرش" }));
    await waitFor(() =>
      expect(sent(api)).toEqual([
        { path: "/actions/acceptances/2/revoke/", body: { values: { reason: "رخداد تازه" } } },
      ]),
    );
  });

  it("shows the decision text of an active acceptance and how many days are left", async () => {
    pageAt(
      "/actions/acceptances/2/",
      acceptanceDetail({
        acceptance: {
          ...acceptanceDetail().acceptance,
          state: { value: "active", label: "معتبر" },
          decision_text: "ریسک آزمون تا ۱۴۰۵/۰۹/۰۳ پذیرفته شد.",
          days_left: 12,
        },
        sign_forms: [],
        revoke: null,
      }),
    );
    renderPage(<AcceptanceDetailPage />, { path: "/actions/acceptances/2", route: "/actions/acceptances/:pk" });
    expect(await screen.findByText("ریسک آزمون تا ۱۴۰۵/۰۹/۰۳ پذیرفته شد.")).toBeInTheDocument();
    expect(screen.getByText("۱۲ روز تا پایان اعتبار مانده است.")).toBeInTheDocument();
    expect(screen.queryByText("لغو پذیرش")).not.toBeInTheDocument();
  });
});

describe("ReassessmentPage", () => {
  it("shows the comparison and the open actions next to the decision form", async () => {
    mockApi({ "GET forms/": reassessmentForm(), "POST forms/": done });
    renderPage(<ReassessmentPage />, {
      path: "/actions/plans/1/reassess",
      route: "/actions/plans/:plan_pk/reassess",
    });
    expect(
      await screen.findByRole("heading", { name: "بازسنجی طرح مواجهه‌ی RK-1405-0001 (کاهش)", level: 1 }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /مقایسه‌ی ارزیابی مبنا، ارزیابی تازه و هدف ریسک RK-1405-0001/ });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent?.slice(0, 12)),
    ).toHaveLength(4);
    expect(screen.getByText(/این اقدام‌ها هنوز تأیید نشده‌اند/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TR-1405-0001" })).toHaveAttribute("href", "/actions/1");
    expect(screen.getByRole("button", { name: "ثبت بازسنجی" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
