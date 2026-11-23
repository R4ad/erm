import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { identificationValues, questionnaireAnswers, questionnaireAnswersSent } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { QuestionnaireAnswersPage } from "./QuestionnaireAnswersPage";

const options = { path: "/questionnaire-answers", route: "/questionnaire-answers" };
const REQUIRED_TEXT = "این پرسش برای ارسال اجباری است.";

/** پاسخ هر شش پرسش و شاهد، بی خدمت. */
const answered = identificationValues({
  subject: "سامانه‌ی آزمون در محیط تولید",
  objective: "پردازش دستورها در پنجره‌ی SLA",
  conditions: "ثبت اشتباه تنظیمات در بسته‌ی انتشار",
  customer: "بانک آزمون و داتین",
  event: "توقف سامانه‌ی آزمون پس از انتشار",
  harm: "توقف پردازش حدود ۹۰ دقیقه",
  evidence: "دو توقف مشابه در شش ماه گذشته",
  evidence_items: ["9"],
});

const question = (label: RegExp) => screen.getByRole("textbox", { name: label });
const position = () => screen.getByText(/^گام .+ از ۷$/);

describe("QuestionnaireAnswersPage", () => {
  it("asks the six questions without the lifecycle bar or the service list and requires the first one", async () => {
    mockApi({ "GET questionnaire-answers/": questionnaireAnswers() });
    const { user } = renderPage(<QuestionnaireAnswersPage />, options);
    expect(await screen.findByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "پاسخ به پرسشنامه‌ها", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "گام‌های فرایند مدیریت ریسک" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "الگوی ثبت سناریو" })).toBeInTheDocument();

    const subject = question(/موضوع بررسی کدام خدمت/);
    expect(subject).toBeRequired();
    expect(screen.getByText(/کارشناس ریسک آن را با فهرست خدمت‌ها تطبیق می‌دهد/)).toBeInTheDocument();
    await user.type(subject, "ساتنا");
    expect(screen.queryByRole("list", { name: /پیشنهاد از فهرست خدمت‌ها/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/خدمت انتخاب‌شده/)).not.toBeInTheDocument();

    await user.clear(subject);
    await user.keyboard("{Enter}");
    expect(position()).toHaveTextContent("گام ۱ از ۷");
    expect(subject).toHaveAttribute("aria-invalid", "true");
    expect(subject).toHaveFocus();
    expect(screen.getByText(REQUIRED_TEXT)).toBeInTheDocument();
    await user.type(subject, "سامانه‌ی آزمون{Enter}");
    expect(position()).toHaveTextContent("گام ۲ از ۷");
    expect(question(/کدام هدف یا تعهد/)).toHaveFocus();
    await expectNoAxeViolations();
  });

  it("meets the entry criteria by the written subject and names the unit and its owner", async () => {
    mockApi({ "GET questionnaire-answers/": questionnaireAnswers({ values: answered }) });
    const { user } = renderPage(<QuestionnaireAnswersPage />, options);
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    const criteria = screen.getByRole("region", { name: "شرط پذیرش ورودی" });
    expect(within(criteria).getByText("۵ از ۵")).toBeInTheDocument();
    expect(within(criteria).getByText(/مالک: کاربر آزمون/)).toBeInTheDocument();
    expect(within(criteria).getByText("پاسخ برای واحد «واحد آزمون» ثبت می‌شود.")).toBeInTheDocument();
    expect(screen.getByText(/عنوان پیشنهادی ریسک:/)).toHaveTextContent("توقف سامانه‌ی آزمون پس از انتشار");
    expect(screen.getByText(/شرحی است که برای کارشناس ریسک فرستاده می‌شود/)).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("leaves the owner to the risk expert when the manager has several units", async () => {
    const data = questionnaireAnswers({ values: answered });
    data.choices!.org_unit.push({ value: "7", name: "واحد دوم آزمون", owner: null });
    mockApi({ "GET questionnaire-answers/": data });
    const { user } = renderPage(<QuestionnaireAnswersPage />, options);
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    const criteria = screen.getByRole("region", { name: "شرط پذیرش ورودی" });
    // مالک نامعلوم شرط ارسال نیست و در شمار نمی‌آید؛ فقط می‌گوید چه کسی و کی تعیینش می‌کند.
    expect(within(criteria).getByText("۴ از ۴")).toBeInTheDocument();
    expect(within(criteria).getByText(/این چهار شاخص را دارد؛ مالک فقط برای اطلاع آمده است/)).toBeInTheDocument();
    expect(within(criteria).getByText(/مالک: پس از انتخاب خدمت توسط کارشناس ریسک تعیین می‌شود/)).toHaveTextContent(
      "(برای اطلاع؛ شرط ارسال نیست)",
    );
    expect(
      within(criteria).getByText("واحد ریسک پس از انتخاب خدمت توسط کارشناس ریسک مشخص می‌شود."),
    ).toBeInTheDocument();
  });

  it("sends the answers for identification, empties the form and lists the entry without a link", async () => {
    const api = mockApi({
      "GET questionnaire-answers/": questionnaireAnswers({
        values: answered,
        draft: {
          id: 31,
          status: { value: "draft", label: "پیش‌نویس" },
          saved_at: { iso: "2026-11-16T09:00:00+00:00", jalali: "1405/08/25 12:30" },
          attachments: [],
        },
      }),
      "POST questionnaire-answers/": reply(201, questionnaireAnswersSent()),
    });
    const { user } = renderPage(<QuestionnaireAnswersPage />, { ...options, path: "/questionnaire-answers?draft=31" });
    await user.click(await screen.findByRole("button", { name: /گام ۷: بازبینی/ }));
    await user.click(screen.getByRole("button", { name: "ارسال برای شناسایی" }));
    const dialog = await screen.findByRole("alertdialog", { name: "پاسخ‌ها برای شناسایی فرستاده شود؟" });
    expect(dialog).toHaveTextContent("دیگر نمی‌توانید آن‌ها را ویرایش یا حذف کنید");
    await user.click(within(dialog).getByRole("button", { name: "ارسال برای شناسایی" }));

    expect(await screen.findByText("پاسخ‌ها ثبت شد و برای شناسایی به کارشناس ریسک رسید.")).toBeInTheDocument();
    expect(api.callsTo("POST questionnaire-answers/")[0]?.body).toMatchObject({
      submit: true,
      draft: 31,
      values: { subject: "سامانه‌ی آزمون در محیط تولید", target: "" },
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/questionnaire-answers$/));
    // فرم خالی از نو ساخته می‌شود و فوکوس به پرسش اول می‌رود، چون دکمه‌ی ارسال دیگر نیست.
    await waitFor(() => expect(question(/موضوع بررسی کدام خدمت/)).toHaveFocus());
    expect(question(/موضوع بررسی کدام خدمت/)).toHaveValue("");
    expect(position()).toHaveTextContent("گام ۱ از ۷");
    expect(screen.queryByText(/^پیش‌نویس · /)).not.toBeInTheDocument();

    const recent = screen.getByRole("region", { name: "ورودی‌های اخیر شناسایی" });
    const [first] = within(recent).getAllByRole("row").slice(1);
    expect(within(first!).getByText("توقف سامانه‌ی آزمون پس از انتشار").closest("a")).toBeNull();
    expect(within(first!).getByText("در حال شناسایی")).toBeInTheDocument();
    expect(within(first!).getByText("سامانه‌ی آزمون در محیط تولید")).toBeInTheDocument();
    // فقط یک درخواست خواندن: صفحه‌ی بی‌پیش‌نویس از جواب ارسال پر شد.
    expect(api.callsTo("GET questionnaire-answers/")).toHaveLength(1);
    await expectNoAxeViolations();
  });

  it("explains the page to someone who is not a unit manager instead of an error", async () => {
    mockApi({
      "GET questionnaire-answers/": reply(403, { detail: "«پاسخ به پرسشنامه‌ها» برای مدیر واحد است." }),
    });
    renderPage(<QuestionnaireAnswersPage />, options);
    expect(await screen.findByText("«پاسخ به پرسشنامه‌ها» برای مدیر واحد است")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /شناسایی ریسک/ })).toHaveAttribute("href", "/identification");
    expect(screen.queryByRole("button", { name: "دوباره امتحان کنید" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows a server error with a retry", async () => {
    mockApi({ "GET questionnaire-answers/": reply(500, {}) });
    renderPage(<QuestionnaireAnswersPage />, options);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "دوباره امتحان کنید" })).toBeInTheDocument();
  });
});
