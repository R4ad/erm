import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  notices,
  pendingConvertForm,
  pendingPicker,
  questionForm,
  questionnaireDetail,
  questionnaireList,
  responseReview,
  reviewDetail,
  reviewList,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { NoticeListPage, ReviewDetailPage } from "../monitoring/MonitoringPages";
import { PendingConvertPage } from "./PendingConvertPage";
import { QuestionFormPage } from "./QuestionFormPage";
import { QuestionnaireDetailPage, QuestionnaireListPage } from "./QuestionnairePages";
import { ResponseListPage, ResponseReviewPage } from "./ReviewPages";

// تعریف پرسشنامه‌ها، بررسی پاسخ‌ها و پایش: همه از پل جنگو می‌خوانند و کارها را به همان view جنگو می‌فرستند.

const done = { message: "انجام شد.", redirect: null };

function pageAt(djangoPath: string, data: unknown, post: unknown = done) {
  return mockApi({
    "GET pages/": (call: ApiCall) => (call.query.get("path")?.split("?")[0] === djangoPath ? data : reply(404, {})),
    "POST forms/": post,
  });
}

const sent = (api: ReturnType<typeof mockApi>) =>
  api.callsTo("POST forms/").map((call) => ({ path: call.query.get("path"), body: call.body }));

describe("QuestionnaireListPage", () => {
  it("lists the questionnaires with their counts and state, and links the create form for GRC", async () => {
    pageAt("/questionnaires/manage/", questionnaireList());
    renderPage(<QuestionnaireListPage />, { path: "/questionnaires/manage" });
    const table = await screen.findByRole("table", { name: "پرسشنامه‌ها" });
    const row = within(table).getByRole("link", { name: "پرسشنامه‌ی آزمون" }).closest("tr")!;
    expect(row).toHaveTextContent("۳");
    expect(row).toHaveTextContent("فعال");
    expect(within(table).getByRole("link", { name: "پرسشنامه‌ی آزمون" })).toHaveAttribute(
      "href",
      "/questionnaires/manage/1",
    );
    expect(within(table).getByRole("link", { name: "پرسشنامه‌ی شاخه‌ای آزمون" }).closest("tr")).toHaveTextContent(
      "غیرفعال",
    );
    expect(screen.getByRole("link", { name: "پرسشنامه‌ی جدید" })).toHaveAttribute("href", "/questionnaires/manage/new");
    await expectNoAxeViolations();
  });

  it("has no create button for people who only read the definitions", async () => {
    pageAt("/questionnaires/manage/", questionnaireList({ create_url: null }));
    renderPage(<QuestionnaireListPage />, { path: "/questionnaires/manage" });
    await screen.findByRole("table", { name: "پرسشنامه‌ها" });
    expect(screen.queryByRole("link", { name: "پرسشنامه‌ی جدید" })).not.toBeInTheDocument();
  });
});

describe("QuestionnaireDetailPage", () => {
  it("shows each question with its kind, options, risk indicators and edit link", async () => {
    pageAt("/questionnaires/manage/1/", questionnaireDetail());
    renderPage(<QuestionnaireDetailPage />, { path: "/questionnaires/manage/1", route: "/questionnaires/manage/:pk" });
    expect(await screen.findByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeInTheDocument();
    const questions = screen.getByRole("list", { name: "سؤال‌های پرسشنامه" });
    const [first, second, third] = within(questions)
      .getAllByRole("listitem", { name: undefined })
      .filter((item) => item.parentElement === questions);
    expect(first).toHaveTextContent("بله و خیر");
    expect(first).toHaveTextContent("اجباری");
    expect(within(first!).getByText("نشانه‌ی ریسک")).toBeInTheDocument();
    expect(within(first!).getByText("SC-0001")).toHaveAttribute("title", "سناریوی آزمون");
    expect(within(second!).getByText("پیامک").tagName).toBe("S");
    expect(second).toHaveTextContent("(غیرفعال)");
    expect(third).toHaveTextContent("غیرفعال");
    expect(within(first!).getByRole("link", { name: "ویرایش سؤال ۱" })).toHaveAttribute(
      "href",
      "/questionnaires/questions/1/edit",
    );
    expect(screen.getByRole("link", { name: "سؤال جدید" })).toHaveAttribute(
      "href",
      "/questionnaires/manage/1/questions/new",
    );
    await expectNoAxeViolations();
  });
});

describe("QuestionFormPage", () => {
  it("sends the question, the formset management fields and every option row to the Django view", async () => {
    const api = mockApi({
      "GET forms/": questionForm(),
      "POST forms/": { message: "سؤال ذخیره شد.", redirect: { href: "/questionnaires/manage/1/", route: null } },
    });
    const { user } = renderPage(<QuestionFormPage />, {
      path: "/questionnaires/questions/1/edit",
      route: "/questionnaires/questions/:pk/edit",
    });
    expect(
      await screen.findByRole("heading", { name: "ویرایش سؤال در «پرسشنامه‌ی آزمون»", level: 1 }),
    ).toBeInTheDocument();
    const options = screen.getByRole("region", { name: "گزینه‌ها" });
    const rows = within(options).getAllByRole("group");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole("checkbox", { name: "نشانه‌ی ریسک" })).toBeChecked();
    await expectNoAxeViolations();

    await user.type(within(rows[2]!).getByRole("textbox", { name: "متن گزینه" }), "نمی‌دانم");
    await user.click(within(rows[0]!).getByRole("checkbox", { name: "فعال" }));
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    const [call] = sent(api);
    expect(call!.path).toBe("/questionnaires/questions/1/edit/");
    const values = (call!.body as { values: Record<string, unknown> }).values;
    expect(values).toMatchObject({
      kind: "yes_no",
      "options-TOTAL_FORMS": "3",
      "options-INITIAL_FORMS": "2",
      "options-0-id": "1",
      "options-0-is_active": false,
      "options-1-scenario": "1",
      "options-1-indicates_risk": true,
      "options-2-text": "نمی‌دانم",
    });
  });

  it("puts the Django option errors next to the option and names its row in the summary", async () => {
    mockApi({
      "GET forms/": questionForm(),
      "POST forms/": reply(400, {
        message: "چند مورد فرم درست نیست؛ کنار هر فیلد آمده است.",
        errors: {
          "options-1-indicates_risk": ["سناریو و دسته فقط برای گزینه‌ی «نشانه‌ی ریسک» است."],
          __all__: ["سؤال گزینه‌ای دست‌کم دو گزینه‌ی فعال می‌خواهد."],
        },
      }),
    });
    const { user } = renderPage(<QuestionFormPage />, {
      path: "/questionnaires/questions/1/edit",
      route: "/questionnaires/questions/:pk/edit",
    });
    await user.click(await screen.findByRole("button", { name: "ذخیره" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("سؤال گزینه‌ای دست‌کم دو گزینه‌ی فعال می‌خواهد.");
    expect(within(summary).getByRole("link", { name: /گزینه‌ی ۲، نشانه‌ی ریسک/ })).toBeInTheDocument();
  });

  it("leaves the options out of a structured questionnaire whose questions are text", async () => {
    mockApi({ "GET forms/": { ...questionForm(), structured: true } });
    renderPage(<QuestionFormPage />, {
      path: "/questionnaires/questions/1/edit",
      route: "/questionnaires/questions/:pk/edit",
    });
    expect(await screen.findByText(/پرسش‌های این پرسشنامه متنی‌اند/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "گزینه‌ها" })).not.toBeInTheDocument();
  });
});

describe("ResponseListPage", () => {
  it("lists the responses with the interview mark, pending count and a link to the review queue", async () => {
    pageAt("/questionnaires/responses/", reviewList());
    renderPage(<ResponseListPage />, { path: "/questionnaires/responses" });
    const table = await screen.findByRole("table", { name: "پاسخ‌های پرسشنامه" });
    const [first] = within(table).getAllByRole("row").slice(1);
    expect(first).toHaveTextContent("(مصاحبه)");
    expect(first).toHaveTextContent("۲");
    expect(within(first!).getByRole("link", { name: "پرسشنامه‌ی آزمون" })).toHaveAttribute(
      "href",
      "/questionnaires/responses/1",
    );
    expect(screen.getByRole("link", { name: /صف بررسی/ })).toHaveAttribute(
      "href",
      "/questionnaires/responses?status=submitted",
    );
    await expectNoAxeViolations();
  });
});

describe("ResponseReviewPage", () => {
  it("shows the answers and pending risks and finishes the review only after every risk is decided", async () => {
    pageAt("/questionnaires/responses/1/", responseReview());
    renderPage(<ResponseReviewPage />, {
      path: "/questionnaires/responses/1",
      route: "/questionnaires/responses/:pk",
    });
    expect(await screen.findByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeInTheDocument();
    const facts = screen.getByRole("complementary", { name: "مشخصات پاسخ" });
    expect(facts).toHaveTextContent("مصاحبه، ثبت با بازبین آزمون");
    const pending = screen.getByRole("list", { name: "ریسک‌های در انتظار این پاسخ" });
    const [open, dismissed] = within(pending).getAllByRole("listitem");
    expect(within(open!).getByRole("link", { name: "ثبت در رجیستر" })).toHaveAttribute(
      "href",
      "/questionnaires/pending/1/convert",
    );
    expect(dismissed).toHaveTextContent("دلیل: دلیل آزمون");
    expect(within(dismissed!).getByRole("link", { name: "RK-1405-0001" })).toHaveAttribute("href", "/risks/1");
    const answers = screen.getByRole("region", { name: "جواب‌ها" });
    expect(within(answers).getByText("نشانه‌ی ریسک")).toBeInTheDocument();
    expect(answers).toHaveTextContent("جواب متنی آزمون");

    const review = screen.getByRole("region", { name: "بررسی عضو GRC" });
    const finish = within(review).getByRole("button", { name: "بررسی تمام شد" });
    expect(finish).toBeDisabled();
    expect(finish).toHaveAccessibleDescription("اول همه‌ی ریسک‌های در انتظار را در رجیستر ثبت کنید یا کنار بگذارید.");
    expect(within(review).getByRole("link", { name: "برگشت با سؤال" })).toHaveAttribute(
      "href",
      "/questionnaires/responses/1/return",
    );
    await expectNoAxeViolations();
  });

  it("marks the response reviewed after a confirmation", async () => {
    const data = responseReview();
    const api = pageAt("/questionnaires/responses/1/", { ...data, review: { ...data.review!, undecided: false } });
    const { user } = renderPage(<ResponseReviewPage />, {
      path: "/questionnaires/responses/1",
      route: "/questionnaires/responses/:pk",
    });
    const review = await screen.findByRole("region", { name: "بررسی عضو GRC" });
    await user.click(within(review).getByRole("button", { name: "بررسی تمام شد" }));
    const dialog = await screen.findByRole("alertdialog", { name: "بررسی این پاسخ تمام شود؟" });
    await user.click(within(dialog).getByRole("button", { name: "بررسی تمام شد" }));
    await waitFor(() =>
      expect(sent(api)).toEqual([{ path: "/questionnaires/responses/1/reviewed/", body: { values: {} } }]),
    );
  });

  it("lets the respondent continue a returned response and shows the return question", async () => {
    const data = responseReview();
    pageAt("/questionnaires/responses/1/", {
      ...data,
      review: null,
      answer_url: "/questionnaires/responses/1/answer/",
      response: {
        ...data.response,
        status: { value: "returned", label: "برگشت‌خورده" },
        return_question: "کدام سامانه؟",
        returned_at: { iso: "2026-11-04", jalali: "1405/08/13" },
        return_due: { iso: "2026-11-11", jalali: "1405/08/20", days_left: 5, overdue: false },
      },
    });
    renderPage(<ResponseReviewPage />, {
      path: "/questionnaires/responses/1",
      route: "/questionnaires/responses/:pk",
    });
    expect(await screen.findByText("کدام سامانه؟")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ادامه‌ی پاسخ" })).toHaveAttribute("href", "/responses/1");
    expect(screen.queryByRole("region", { name: "بررسی عضو GRC" })).not.toBeInTheDocument();
  });
});

describe("PendingConvertPage", () => {
  it("first picks a scenario, then shows the risk form with the pending risk", async () => {
    mockApi({
      "GET forms/": (call: ApiCall) =>
        call.query.get("path")?.includes("scenario=") ? pendingConvertForm() : pendingPicker(),
      "POST forms/": done,
    });
    const { user } = renderPage(<PendingConvertPage />, {
      path: "/questionnaires/pending/1/convert",
      route: "/questionnaires/pending/:pk/convert",
    });
    expect(await screen.findByRole("heading", { name: "انتخاب سناریو برای ثبت ریسک", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("مورد جدید آزمون")).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.click(screen.getByRole("link", { name: /SC-0001 سناریوی آزمون/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/questionnaires/pending/1/convert?scenario=1"),
    );
    expect(await screen.findByRole("heading", { name: "ثبت ریسک در انتظار در رجیستر", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت در رجیستر" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "جزئیات سناریو" })).toBeInTheDocument();
  });
});

describe("NoticeListPage", () => {
  it("marks an unread notice as read through the Django view", async () => {
    const api = pageAt("/actions/notices/", notices(), {
      message: "اعلان خوانده شد.",
      redirect: { href: "/actions/notices/", route: "/actions/notices" },
    });
    const { user } = renderPage(<NoticeListPage />, { path: "/actions/notices" });
    const list = await screen.findByRole("list", { name: "اعلان‌ها" });
    const [unread, read] = within(list).getAllByRole("listitem");
    expect(within(unread!).getByRole("link", { name: /بازبینی آزمون/ })).toHaveAttribute("href", "/actions/reviews/1");
    expect(within(read!).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/۱ اعلان خوانده‌نشده/)).toBeInTheDocument();
    await expectNoAxeViolations();
    await user.click(within(unread!).getByRole("button", { name: /^خواندم/ }));
    await waitFor(() => expect(sent(api)).toEqual([{ path: "/actions/notices/1/read/", body: { values: {} } }]));
    expect(await screen.findByText("اعلان خوانده شد.", { exact: true })).toBeInTheDocument();
  });
});

describe("ReviewDetailPage", () => {
  it("records the review result and shows the Django error next to the field", async () => {
    const api = pageAt(
      "/actions/reviews/1/",
      reviewDetail(),
      reply(400, { message: "چند مورد فرم درست نیست.", errors: { result: ["این مقدار لازم است."] } }),
    );
    const { user } = renderPage(<ReviewDetailPage />, { path: "/actions/reviews/1", route: "/actions/reviews/:pk" });
    expect(
      await screen.findByRole("heading", { name: "رخداد مهم یا بهره‌برداری فعال: RK-1405-0001", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "مشخصات بازبینی" })).toHaveTextContent("مالک آزمون");
    await expectNoAxeViolations();
    const result = screen.getByRole("textbox", { name: /نتیجه و اقدام بعدی/ });
    await user.click(screen.getByRole("button", { name: "ثبت نتیجه بررسی" }));
    expect(await screen.findByText("این مقدار لازم است.")).toBeInTheDocument();
    await user.type(result, "ارجاع به مدیریت رخداد");
    expect(sent(api)[0]).toEqual({ path: "/actions/reviews/1/", body: { values: { result: "" } } });
  });

  it("shows the recorded result once the review is complete", async () => {
    pageAt(
      "/actions/reviews/1/",
      reviewDetail({
        complete: null,
        review: {
          ...reviewDetail().review,
          completed_at: { iso: "2026-11-05T08:30:00+00:00", jalali: "1405/08/14 12:00" },
          completed_by: { id: 2, name: "مالک آزمون" },
          result: "نتیجه‌ی آزمون",
        },
      }),
    );
    renderPage(<ReviewDetailPage />, { path: "/actions/reviews/1", route: "/actions/reviews/:pk" });
    expect(await screen.findByText("نتیجه‌ی آزمون")).toBeInTheDocument();
    expect(screen.getByText("نتیجه ثبت شده")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ثبت نتیجه بررسی" })).not.toBeInTheDocument();
  });
});
