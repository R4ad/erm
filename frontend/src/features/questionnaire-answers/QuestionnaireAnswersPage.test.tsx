import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnswerValues, QuestionnaireAnswersData } from "@/lib/types";
import { mockApi, reply, type ApiCall } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { answerResponse, answeredValues, blankAnswers, questionnaireAnswers, responseRow } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { eventGroups, sharedBy, stepOfField, stepProblems, summary, tidy } from "./answers";
import { QuestionnaireAnswersPage } from "./QuestionnaireAnswersPage";

const URL = "questionnaire-answers/";

const blank = blankAnswers();
const answered = answeredValues();
const response = answerResponse;
const row = responseRow;
const page = (overrides: Partial<QuestionnaireAnswersData> = {}) =>
  questionnaireAnswers({ recent: [row()], ...overrides });

const wizard = () => screen.getByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" });

describe("پاسخ به پرسشنامه‌ها", () => {
  it("گام اول، گام‌نما و جدول اخیر را طبق فریم 30 نشان می‌دهد", async () => {
    mockApi({ [`GET ${URL}`]: page() });
    const { container } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers" });

    expect(screen.getByRole("heading", { level: 1, name: "پاسخ به پرسشنامه‌ها" })).toBeInTheDocument();
    expect(
      within(await screen.findByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" })).getByText("ورودی تازه"),
    ).toBeInTheDocument();
    expect(within(wizard()).getByText("گام ۱ از ۸")).toBeInTheDocument();
    const steps = within(screen.getByRole("navigation", { name: "گام‌های پاسخنامه" })).getAllByRole("button");
    expect(steps).toHaveLength(8);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("موضوع بررسی کدام خدمت یا فرآیند است؟")).toHaveAttribute(
      "placeholder",
      "پاسخ کوتاه و مشخص",
    );
    const table = screen.getByRole("table", { name: "پاسخنامه‌های اخیر" });
    expect(within(table).getByText("QR-1405-0109")).toBeInTheDocument();
    expect(within(table).getByText("۳ مسیر تحقق · ۲ رویداد")).toBeInTheDocument();
    expect(within(table).getByText("در انتظار بررسی")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("بی‌پاسخ به گام بعد نمی‌رود و Enter گام بعد را باز می‌کند", async () => {
    mockApi({ [`GET ${URL}`]: page() });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers" });

    await user.click(await screen.findByRole("button", { name: /بعدی/ }));
    expect(screen.getByText("این پرسش را پاسخ دهید.")).toBeInTheDocument();
    const input = screen.getByLabelText("موضوع بررسی کدام خدمت یا فرآیند است؟");
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.type(input, "انتقال وجه ساتنا{Enter}");
    expect(await screen.findByLabelText("کدام هدف یا تعهد مختل می‌شود؟")).toHaveFocus();
    expect(screen.getByText("گام ۲ از ۸")).toBeInTheDocument();
  });

  it("مسیر تحقق اضافه و حذف می‌شود و مسیری که رویدادش انتخاب شده حذف نمی‌شود", async () => {
    mockApi({
      [`GET ${URL}`]: page({ values: answered, response: response({ step: 5 }) }),
    });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers?response=113" });

    expect(await screen.findByText("عامل و وضعیت:")).toBeInTheDocument();
    expect(screen.getByLabelText("مسیر تحقق ۱")).toHaveValue(answered.paths[0]?.description);
    await user.click(screen.getByRole("button", { name: "حذف مسیر تحقق ۲" }));
    expect(
      screen.getByText("رویداد این مسیر در مسیر ۳ هم انتخاب شده است؛ اول آن مسیر را تغییر دهید."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("مسیر تحقق ۳")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "افزودن مسیر تحقق" }));
    expect(screen.getByLabelText("مسیر تحقق ۴")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "حذف مسیر تحقق ۴" }));
    expect(screen.queryByLabelText("مسیر تحقق ۴")).not.toBeInTheDocument();
  });

  it("رویداد مسیر بعدی از رویدادهای قبلی انتخاب می‌شود و پیامدش یک بار پرسیده می‌شود", async () => {
    const values: AnswerValues = {
      ...answered,
      paths: answered.paths.map((path) => (path.key === "p3" ? { ...path, event: "e3" } : path)),
      events: [...answered.events, { key: "e3", text: "" }],
      impacts: [],
    };
    mockApi({ [`GET ${URL}`]: page({ values, response: response({ step: 6 }) }) });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers?response=113" });

    await screen.findByText("در هر مسیر تحقق، چه رویداد مشخصی ممکن است رخ دهد؟");
    const third = screen.getByRole("listitem", { name: "مسیر تحقق ۳" });
    await user.click(within(third).getByRole("button", { name: "انتخاب از رویدادهای قبلی" }));
    expect(within(third).getByRole("button", { name: "انتخاب از رویدادهای قبلی" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(third).getByRole("radio", { name: /توقف کامل پردازش پیام‌های ساتنا/ }));
    expect(
      within(third).getByText("پیامدِ رویداد ۲ به این مسیر هم نسبت داده می‌شود و در گام بعد دوباره پرسیده نمی‌شود."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(await screen.findByText("پیامد قابل مشاهده‌ی هر رویداد و دامنه‌ی آن چیست؟")).toBeInTheDocument();
    expect(screen.getByText("۳ مسیر تحقق")).toBeInTheDocument();
    expect(screen.getByText("۲ رویداد مشخص")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /نوع پیامد/ })).toHaveLength(2);
    expect(screen.getByText("از مسیرهای")).toBeInTheDocument();
  });

  it("نوع پیامد چندتایی از بُعدهای روش انتخاب می‌شود", async () => {
    mockApi({ [`GET ${URL}`]: page({ values: { ...answered, impacts: [] }, response: response({ step: 7 }) }) });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers?response=113" });

    const [first] = await screen.findAllByRole("button", { name: /نوع پیامد/ });
    expect(first).toHaveTextContent("انتخاب نوع پیامد");
    await user.click(first!);
    await user.click(screen.getByRole("checkbox", { name: "مالی" }));
    await user.click(screen.getByRole("checkbox", { name: "اعتبار و رابطه مشتری" }));
    await user.keyboard("{Escape}");
    expect(first).toHaveTextContent("مالی، اعتبار و رابطه مشتری");

    await user.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getAllByText("دامنه‌ی پیامد را بنویسید.")).toHaveLength(2);
    expect(screen.getByText("دست‌کم یک نوع پیامد انتخاب کنید.")).toBeInTheDocument();
  });

  it("پیش‌نویس با Ctrl+S ذخیره و نشانی ?response= می‌شود", async () => {
    const api = mockApi({
      [`GET ${URL}`]: page(),
      [`POST ${URL}`]: {
        message: "پیش‌نویس ذخیره شد.",
        response: response(),
        recent: [
          row({ id: 113, code: "QR-1405-0113", status: { value: "draft", label: "پیش‌نویس", tone: "neutral" } }),
        ],
      },
    });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers" });

    await user.type(await screen.findByLabelText("موضوع بررسی کدام خدمت یا فرآیند است؟"), "انتقال وجه ساتنا");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(await screen.findByText("پیش‌نویس ذخیره شد.")).toBeInTheDocument();
    const [call] = api.callsTo(`POST ${URL}`) as [ApiCall];
    expect(call.body).toMatchObject({
      response: null,
      step: 1,
      submit: false,
      values: { service: "انتقال وجه ساتنا" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/questionnaire-answers?response=113"),
    );
    expect(within(wizard()).getByText("پیش‌نویس")).toBeInTheDocument();
    expect(screen.getByLabelText("موضوع بررسی کدام خدمت یا فرآیند است؟")).toHaveValue("انتقال وجه ساتنا");
  });

  it("خطای اتصال در ذخیره متن تأییدشده را نشان می‌دهد", async () => {
    mockApi({ [`GET ${URL}`]: page(), [`POST ${URL}`]: reply(500, {}) });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers" });

    await user.click(await screen.findByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    expect(await screen.findByText("پیش‌نویس ذخیره نشد. اتصال را بررسی کنید و دوباره ذخیره کنید.")).toBeInTheDocument();
  });

  it("بازبینی پاسخ‌ها را گروه‌بندی می‌کند و ارسال پیام موفقیت و ردیف تازه را نشان می‌دهد", async () => {
    const sent = response({ status: { value: "submitted", label: "در انتظار بررسی", tone: "info" }, step: 8 });
    const api = mockApi({
      [`GET ${URL}`]: page({ values: answered, response: response({ step: 8 }) }),
      [`POST ${URL}`]: {
        message: "پاسخنامه‌ی QR-1405-0113 برای کارشناس ریسک فرستاده شد.",
        response: sent,
        summary: { paths: 3, events: 2, impacts: 2 },
        recent: [
          row({ id: 113, code: "QR-1405-0113", service: "انتقال وجه ساتنا", org_unit: "عملیات زیرساخت" }),
          row(),
        ],
      },
    });
    const { user, container } = renderPage(<QuestionnaireAnswersPage />, {
      path: "/questionnaire-answers?response=113",
    });

    expect(await screen.findByText("پیش از ارسال، پاسخ‌ها را بازبینی کنید")).toBeInTheDocument();
    expect(within(wizard()).getByText("آماده‌ی ارسال")).toBeInTheDocument();
    expect(
      screen.getByText("همه‌ی پرسش‌های اجباری پاسخ داده شده‌اند؛ پاسخنامه آماده‌ی ارسال است."),
    ).toBeInTheDocument();
    expect(screen.getByText("مالی، اعتبار و رابطه مشتری")).toBeInTheDocument();
    expect(screen.getByText("۳ مسیر")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: "ویرایش هدف یا تعهد" }));
    expect(screen.getByLabelText("کدام هدف یا تعهد مختل می‌شود؟")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /گام ۸: بازبینی/ }));

    await user.click(screen.getByRole("button", { name: /ارسال برای شناسایی/ }));
    expect(await screen.findByRole("heading", { name: "پاسخنامه با موفقیت ارسال شد" })).toHaveFocus();
    const [call] = api.callsTo(`POST ${URL}`) as [ApiCall];
    expect(call.body).toMatchObject({ response: 113, submit: true });
    expect(within(wizard()).getByText("ارسال‌شده")).toBeInTheDocument();
    expect(within(wizard()).getByText("QR-1405-0113")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مشاهده‌ی پاسخنامه" })).toHaveAttribute(
      "href",
      "/identification/responses/113",
    );
    const fresh = screen.getByText("تازه ارسال‌شده · ۳ مسیر تحقق · ۲ رویداد").closest("tr");
    expect(fresh).toHaveAttribute("data-fresh", "true");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/questionnaire-answers$/));
    expect(api.callsTo(`GET ${URL}`).filter((call) => !call.query.get("response"))).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "پاسخ به پرسشنامه‌ی جدید" }));
    expect(within(wizard()).getByText("ورودی تازه")).toBeInTheDocument();
    expect(screen.getByLabelText("موضوع بررسی کدام خدمت یا فرآیند است؟")).toHaveValue("");
  });

  it("ارسال ناقص به اولین گام بی‌پاسخ می‌رود", async () => {
    const api = mockApi({
      [`GET ${URL}`]: page({ values: { ...answered, responsibility: "" }, response: response({ step: 8 }) }),
    });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers?response=113" });

    expect(
      await screen.findByText("۱ پرسش اجباری بی‌پاسخ مانده است؛ پیش از ارسال آن‌ها را کامل کنید."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ارسال برای شناسایی/ }));
    expect(screen.getByLabelText("داتین، مشتری یا هر دو متأثرند؟")).toHaveFocus();
    expect(api.callsTo(`POST ${URL}`)).toHaveLength(0);
  });

  it("پاسخنامه‌ی بازگشتی پیام و پرسش‌های کارشناس را نشان می‌دهد", async () => {
    mockApi({
      [`GET ${URL}`]: page({
        values: answered,
        response: response({
          step: 5,
          status: { value: "returned", label: "بازگشت برای تکمیل اطلاعات", tone: "warning" },
          returned: {
            message: "مسیر دوم را دقیق‌تر بنویسید.",
            questions: [{ text: "صف پیام‌ها چه مدت متوقف می‌ماند؟", step: 5, about: "مسیر تحقق ۲" }],
            due: { iso: "2026-11-26", jalali: "1405/09/05", days_left: 3, overdue: false },
          },
        }),
      }),
    });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers?response=113" });

    expect(await screen.findByText("این پاسخنامه برای تکمیل اطلاعات بازگردانده شده است")).toBeInTheDocument();
    expect(screen.getByText("مسیر دوم را دقیق‌تر بنویسید.")).toBeInTheDocument();
    expect(screen.getByText("مهلت تکمیل: تا ۱۴۰۵/۰۹/۰۵")).toBeInTheDocument();
    expect(within(wizard()).getByText("بازگشت برای تکمیل اطلاعات")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "درباره‌ی مسیر تحقق ۲" }));
    expect(screen.getByText("گام ۵ از ۸")).toBeInTheDocument();
  });

  it("مدیر چند واحد واحد پاسخنامه‌ی تازه را انتخاب می‌کند", async () => {
    mockApi({
      [`GET ${URL}`]: page({
        unit: null,
        units: [
          { value: "3", label: "عملیات زیرساخت" },
          { value: "4", label: "پرداخت الکترونیک" },
        ],
      }),
    });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers" });

    await user.type(await screen.findByLabelText("موضوع بررسی کدام خدمت یا فرآیند است؟"), "ساتنا");
    await user.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText("واحد را انتخاب کنید.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "پرداخت الکترونیک" }));
    await user.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText("گام ۲ از ۸")).toBeInTheDocument();
  });

  it("جدول خالی متن تأییدشده را دارد", async () => {
    mockApi({ [`GET ${URL}`]: page({ recent: [] }) });
    renderPage(<QuestionnaireAnswersPage />, { path: "/questionnaire-answers" });
    expect(
      await screen.findByText("هنوز پاسخنامه‌ای نفرستاده‌اید. با پاسخ به پرسش‌های بالا اولین پاسخنامه را بسازید."),
    ).toBeInTheDocument();
  });
});

describe("قاعده‌های ویزارد", () => {
  it("رویدادها به ترتیب اولین مسیر گروه می‌شوند", () => {
    expect(eventGroups(answered).map((group) => [group.key, group.number, group.paths])).toEqual([
      ["e1", 1, [1]],
      ["e2", 2, [2, 3]],
    ]);
    expect(summary(answered)).toEqual({ paths: 3, events: 2, impacts: 2 });
  });

  it("مسیری که رویدادش را مسیر بعدی انتخاب کرده حذف نمی‌شود", () => {
    expect(sharedBy(answered, "p2")).toBe(3);
    expect(sharedBy(answered, "p3")).toBeNull();
    expect(sharedBy(answered, "p1")).toBeNull();
  });

  it("رویداد و پیامد بی‌مسیر کنار می‌روند", () => {
    const values = tidy({ ...answered, paths: answered.paths.slice(0, 1) });
    expect(values.events.map((event) => event.key)).toEqual(["e1"]);
    expect(values.impacts.map((impact) => impact.event)).toEqual(["e1"]);
  });

  it("خطای هر فیلد به گام خودش می‌رود", () => {
    expect(stepOfField("objective")).toBe("objective");
    expect(stepOfField("paths")).toBe("paths");
    expect(stepOfField("paths.p1")).toBe("paths");
    expect(stepOfField("paths.p1.event")).toBe("events");
    expect(stepOfField("events.e1")).toBe("events");
    expect(stepOfField("org_unit")).toBe("service");
    expect(stepOfField("impacts.e1.scope")).toBe("impacts");
  });

  it("گام مسیرها بدون مسیر کامل نیست", () => {
    expect(stepProblems(blank, "paths")).toEqual({ paths: ["دست‌کم یک مسیر تحقق اضافه کنید."] });
    expect(stepProblems(answered, "impacts")).toEqual({});
  });
});
