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
  const body = call.body as { fixed: Record<string, string>; answers: Record<string, unknown>; submit: boolean };
  const saved = response();
  saved.fixed = saved.fixed.map((item) => ({ ...item, value: body.fixed[item.name] ?? "" }));
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
  it("opens on the first incomplete step with the header, stepper and progress (Figma 10)", async () => {
    mockApi({ "GET responses/1/": response() });
    renderPage(<ResponseFormPage />, options);
    expect(await screen.findByRole("heading", { name: "پرسشنامه‌ی آزمون — واحد آزمون", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("سؤال آزمونی بازبین برای تکمیل.")).toBeInTheDocument();
    expect(screen.getByText("کانال: پرسشنامه")).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "گام‌های پاسخ" });
    expect(within(steps).getByRole("button", { name: /کارکردها و تعهدها/ })).toHaveAttribute("aria-current", "step");
    expect(within(steps).getByRole("button", { name: /هشت پرسش جلسه‌ی شناسایی/ })).toHaveTextContent("۱ از ۲");
    expect(screen.getByRole("progressbar", { name: "پیشرفت کل پاسخ" })).toHaveAttribute("aria-valuenow", "10");
    expect(screen.getByRole("heading", { name: "کارکردها و تعهدها", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("خروجی مورد انتظار: کارکرد و تعهد قابل مشاهده")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /کارکرد [۱-۵]/ })).toHaveLength(5);
    expect(screen.getByText("۱ سؤال اجباری در این بخش باقی مانده است.")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("moves between steps; an answered question reads as text until it is edited", async () => {
    mockApi({ "GET responses/1/": response() });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.click(await screen.findByRole("button", { name: /بعدی: هشت پرسش جلسه/ }));
    expect(screen.getByRole("heading", { name: "هشت پرسش جلسه‌ی شناسایی", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("خروجی مورد انتظار: رویداد مخل")).toBeInTheDocument();
    expect(screen.getByText("۰ / ۱۰۰۰ نویسه")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /افزودن پیوست \(اختیاری\) · حداکثر ۲۰ مگابایت/ })).toBeInTheDocument();
    const answered = screen.getByRole("button", { name: /پایگاه داده‌ی مرکزی/ });
    await user.click(answered);
    expect(screen.getByRole("textbox", { name: "به چه افراد یا خدماتی وابسته‌ایم؟" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /بعدی: سؤال‌های GRC/ }));
    expect(screen.getByRole("radiogroup", { name: /سؤال تک‌گزینه‌ای آزمون/ })).toHaveAttribute("aria-required", "true");
    await expectNoAxeViolations();
  });

  it("lists missing required answers and each link opens its step", async () => {
    const api = mockApi({ "GET responses/1/": response() });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.click(await screen.findByRole("button", { name: "پیش‌نمایش" }));
    expect(screen.getByRole("heading", { name: "مرور و ارسال", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText("اجباری، بی‌جواب").length).toBe(4);
    await user.click(screen.getByRole("button", { name: "ارسال برای بررسی" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("۴ مورد پیش از ارسال درست شود");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.callsTo("PUT responses/1/")).toHaveLength(0);

    await user.click(within(summary).getByRole("link", { name: "سؤال ۲ GRC" }));
    expect(screen.getByRole("heading", { name: "سؤال‌های GRC", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /سؤال تک‌گزینه‌ای آزمون/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("saves a draft with the functions joined as lines", async () => {
    const api = mockApi({ "GET responses/1/": response(), "PUT responses/1/": saveReply });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.type(await screen.findByRole("textbox", { name: "کارکرد ۱" }), "انتقال وجه");
    await user.type(screen.getByRole("textbox", { name: "کارکرد ۲" }), "تسویه");
    expect(screen.getByText("تغییرات ذخیره نشده")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    expect(await screen.findByText("پیش‌نویس ذخیره شد.")).toBeInTheDocument();
    expect(api.callsTo("PUT responses/1/")[0]?.body).toEqual({
      fixed: { functions: "انتقال وجه\nتسویه", disruptive_event: "", dependencies: "پایگاه داده‌ی مرکزی" },
      new_item: "",
      answers: { "1": "", "2": null, "3": [] },
      submit: false,
    });
    expect(screen.getByText(/ذخیره‌ی خودکار/)).toBeInTheDocument();
  });

  it("saves the draft by itself a moment after the last change", async () => {
    const api = mockApi({ "GET responses/1/": response(), "PUT responses/1/": saveReply });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.type(await screen.findByRole("textbox", { name: "کارکرد ۱" }), "انتقال وجه");
    await waitFor(() => expect(api.callsTo("PUT responses/1/")).toHaveLength(1), { timeout: 5000 });
    expect(api.callsTo("PUT responses/1/")[0]?.body).toMatchObject({ submit: false });
    expect(screen.queryByText("پیش‌نویس ذخیره شد.")).not.toBeInTheDocument();
  });

  it("asks before submitting and becomes read-only after", async () => {
    const api = mockApi({ "GET responses/1/": response(), "PUT responses/1/": saveReply });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.type(await screen.findByRole("textbox", { name: "کارکرد ۱" }), "انتقال وجه");
    await user.click(screen.getByRole("button", { name: /بعدی: هشت پرسش جلسه/ }));
    await user.type(screen.getByRole("textbox", { name: "چه اتفاقی می‌تواند مانع انجام آن شود؟" }), "قطع شبکه");
    await user.click(screen.getByRole("button", { name: /بعدی: سؤال‌های GRC/ }));
    await user.type(screen.getByRole("textbox", { name: "سؤال متنی آزمون" }), "جواب آزمون");
    await user.click(screen.getByLabelText("گزینه‌ی دوم"));
    await user.click(screen.getByRole("button", { name: /بعدی: مورد جدید/ }));
    await user.click(screen.getByRole("button", { name: /بعدی: مرور و ارسال/ }));

    const submit = screen.getByRole("button", { name: "ارسال برای بررسی" });
    await user.click(submit);
    const dialog = await screen.findByRole("alertdialog", { name: "پاسخ برای بررسی فرستاده شود؟" });
    await user.click(within(dialog).getByRole("button", { name: "ارسال برای بررسی" }));
    expect(await screen.findByText("پاسخ برای بررسی فرستاده شد.")).toBeInTheDocument();
    const sentBody = api.callsTo("PUT responses/1/").at(-1)?.body;
    expect(sentBody).toMatchObject({
      fixed: { functions: "انتقال وجه", disruptive_event: "قطع شبکه" },
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
        errors: { question_2: ["این سؤال اجباری است."], disruptive_event: ["این پرسش اجباری است."] },
        response: response(),
      }),
    });
    const { user } = renderPage(<ResponseFormPage />, options);
    await user.click(await screen.findByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: "سؤال ۲ GRC" })).toBeInTheDocument();
    await user.click(within(summary).getByRole("link", { name: "پرسش ۱ جلسه" }));
    expect(screen.getByRole("textbox", { name: "چه اتفاقی می‌تواند مانع انجام آن شود؟" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
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
    await user.type(await screen.findByRole("textbox", { name: "کارکرد ۱" }), "نیمه");
    await user.click(screen.getByRole("link", { name: "بازگشت" }));
    const dialog = await screen.findByRole("alertdialog", { name: "تغییرات ذخیره نشده است" });
    await user.click(within(dialog).getByRole("button", { name: "ماندن در صفحه" }));
    expect(screen.getByRole("textbox", { name: "کارکرد ۱" })).toHaveValue("نیمه");

    await user.click(screen.getByRole("link", { name: "بازگشت" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "رفتن بدون ذخیره" }));
    expect(await screen.findByRole("heading", { name: "خانه‌ی پرسشنامه" })).toBeInTheDocument();
  });

  it("lets an optional single choice be cleared", async () => {
    const optional = response();
    optional.questions = optional.questions.map((question) => ({ ...question, required: false }));
    mockApi({ "GET responses/1/": optional });
    const { user } = renderPage(<ResponseFormPage />, { ...options, path: "/responses/1?step=grc" });
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
