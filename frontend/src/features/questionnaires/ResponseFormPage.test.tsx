import { screen, waitFor, within } from "@testing-library/react";
import { Link } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { response } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ResponseFormPage } from "./ResponseFormPage";

const options = { path: "/responses/1", route: "/responses/:id" };

/** سرور آزمون: پاسخ ذخیره‌شده را با همان مقدارها برمی‌گرداند و بعد از ارسال، پاسخ دیگر قابل ویرایش نیست. */
function saveReply(call: ApiCall) {
  const body = call.body as { answers: Record<string, unknown>; submit: boolean };
  const saved = response();
  saved.questions = saved.questions.map((question) => ({
    ...question,
    value: (body.answers[String(question.id)] ?? null) as never,
  }));
  if (body.submit) {
    Object.assign(saved, { can_edit: false, is_editable: false, status: { value: "submitted", label: "ارسال‌شده" } });
  }
  return { message: body.submit ? "پاسخ برای بررسی فرستاده شد." : "پیش‌نویس ذخیره شد.", response: saved };
}

describe("ResponseFormPage", () => {
  it("shows the reviewer's question and the editable form", async () => {
    mockApi({ "GET responses/1/": response() });
    renderPage(<ResponseFormPage />, options);
    expect(await screen.findByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("سؤال آزمونی بازبین برای تکمیل.")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /سؤال ۲/ })).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("progressbar", { name: "پیشرفت پاسخ" })).toHaveAttribute("aria-valuenow", "0");
    await expectNoAxeViolations();
  });

  it("lists missing required answers in a focused summary instead of opening the confirm", async () => {
    const api = mockApi({ "GET responses/1/": response() });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.click(await screen.findByRole("button", { name: "ارسال برای بررسی" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("۲ مورد پیش از ارسال درست شود");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.callsTo("PUT responses/1/")).toHaveLength(0);

    // پیوند هر مورد فوکوس را به همان سؤال می‌برد.
    await user.click(within(summary).getByRole("link", { name: "سؤال ۱" }));
    expect(screen.getByRole("textbox", { name: /سؤال ۱/ })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /سؤال ۱/ })).toHaveAttribute("aria-invalid", "true");
    await expectNoAxeViolations();
  });

  it("updates inline errors on each submit attempt", async () => {
    mockApi({ "GET responses/1/": response() });
    const { user } = renderPage(<ResponseFormPage />, options);
    const text = await screen.findByRole("textbox", { name: /سؤال ۱/ });
    const choices = screen.getByRole("radiogroup", { name: /سؤال ۲/ });
    const submit = screen.getByRole("button", { name: "ارسال برای بررسی" });

    await user.click(submit);
    await waitFor(() => expect(text).toHaveAttribute("aria-invalid", "true"));
    expect(choices).toHaveAttribute("aria-invalid", "true");

    await user.type(text, "جواب");
    await user.click(submit);
    await waitFor(() => expect(text).not.toHaveAttribute("aria-invalid"));
    expect(choices).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("۱ مورد پیش از ارسال درست شود");
  });

  it("saves a draft without the required answers", async () => {
    const api = mockApi({ "GET responses/1/": response(), "PUT responses/1/": saveReply });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.click(await screen.findByLabelText("مورد الف"));
    expect(screen.getByText("تغییرات ذخیره نشده است")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    expect(await screen.findByText("پیش‌نویس ذخیره شد.")).toBeInTheDocument();
    expect(api.callsTo("PUT responses/1/")[0]?.body).toEqual({
      fixed: { functions: "" },
      new_item: "",
      answers: { "1": "", "2": null, "3": [21] },
      submit: false,
    });
    expect(screen.getByText("همه‌ی تغییرات ذخیره شده است")).toBeInTheDocument();
  });

  it("asks before submitting and becomes read-only after", async () => {
    const api = mockApi({ "GET responses/1/": response(), "PUT responses/1/": saveReply });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.type(await screen.findByRole("textbox", { name: /سؤال ۱/ }), "جواب آزمون");
    await user.click(screen.getByLabelText("گزینه‌ی دوم"));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");

    const submit = screen.getByRole("button", { name: "ارسال برای بررسی" });
    await user.click(submit);
    const dialog = await screen.findByRole("alertdialog", { name: "پاسخ برای بررسی فرستاده شود؟" });
    // «انصراف» فوکوس را به دکمه‌ی ارسال برمی‌گرداند و چیزی فرستاده نمی‌شود.
    await user.click(within(dialog).getByRole("button", { name: "انصراف" }));
    await waitFor(() => expect(submit).toHaveFocus());
    expect(api.callsTo("PUT responses/1/")).toHaveLength(0);

    await user.click(submit);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ارسال برای بررسی" }));
    expect(await screen.findByText("پاسخ برای بررسی فرستاده شد.")).toBeInTheDocument();
    expect(api.callsTo("PUT responses/1/")[0]?.body).toMatchObject({
      answers: { "1": "جواب آزمون", "2": 12, "3": [] },
      submit: true,
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "ذخیره‌ی پیش‌نویس" })).not.toBeInTheDocument());
    expect(screen.getByText("جواب آزمون")).toBeInTheDocument();
  });

  it("puts the server's field errors on the right questions", async () => {
    mockApi({
      "GET responses/1/": response(),
      "PUT responses/1/": reply(400, {
        message: "پاسخ ذخیره شد ولی ارسال نشد.",
        errors: { question_2: ["این سؤال اجباری است."], new_item: ["شرح کوتاه است."] },
        response: response(),
      }),
    });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.click(await screen.findByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: "سؤال ۲" })).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "ریسک تازه" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /سؤال ۲/ })).toHaveAccessibleDescription("این سؤال اجباری است.");
    expect(screen.getByRole("textbox", { name: "شرح ریسک تازه" })).toHaveAttribute("aria-invalid", "true");
  });

  it("warns before leaving with unsaved answers", async () => {
    mockApi({ "GET responses/1/": response() });
    const page = (
      <>
        <ResponseFormPage />
        <Link to="/questionnaires">بازگشت</Link>
      </>
    );
    const { user } = renderPage(page, {
      ...options,
      routes: [{ path: "/questionnaires", element: <h1>خانه‌ی پرسشنامه</h1> }],
    });
    await user.type(await screen.findByRole("textbox", { name: /سؤال ۱/ }), "نیمه‌کاره");
    await user.click(screen.getByRole("link", { name: "بازگشت" }));
    const dialog = await screen.findByRole("alertdialog", { name: "تغییرات ذخیره نشده است" });
    await user.click(within(dialog).getByRole("button", { name: "ماندن در صفحه" }));
    expect(screen.getByRole("textbox", { name: /سؤال ۱/ })).toHaveValue("نیمه‌کاره");

    await user.click(screen.getByRole("link", { name: "بازگشت" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "رفتن بدون ذخیره" }));
    expect(await screen.findByRole("heading", { name: "خانه‌ی پرسشنامه" })).toBeInTheDocument();
  });

  it("lets an optional single choice be cleared", async () => {
    const optional = response();
    optional.questions = optional.questions.map((question) => ({ ...question, required: false }));
    mockApi({ "GET responses/1/": optional });
    const { user } = renderPage(<ResponseFormPage />, options);
    const choice = await screen.findByLabelText("گزینه‌ی اول");
    expect(screen.queryByRole("button", { name: "پاک کردن جواب" })).not.toBeInTheDocument();
    await user.click(choice);
    await user.click(await screen.findByRole("button", { name: "پاک کردن جواب" }));
    expect(choice).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "پاک کردن جواب" })).not.toBeInTheDocument();
  });

  it("shows a submitted response read-only", async () => {
    mockApi({
      "GET responses/1/": response({
        can_edit: false,
        return_question: "",
        status: { value: "submitted", label: "ارسال‌شده" },
      }),
    });
    renderPage(<ResponseFormPage />, options);
    expect(await screen.findByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByText("بی‌جواب").length).toBeGreaterThan(0);
  });
});
