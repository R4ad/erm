import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { initiatorForm, riskForm, transitionForm, uploadForm } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { FormPage } from "./FormPage";

const saved = { message: "ریسک «ریسک آزمون» ذخیره شد.", redirect: { href: "/risks/1/", route: "/risks/1" } };

function setup(path: string, page: unknown, post: unknown = saved) {
  const api = mockApi({
    "GET forms/": (call: ApiCall) => (call.query.get("path") === `${path}/` ? page : reply(404, {})),
    "POST forms/": post,
  });
  const view = renderPage(<FormPage />, { path });
  return { api, ...view, location: () => screen.getByTestId("location").textContent };
}

describe("FormPage", () => {
  it("renders the Django form with every kind of field, labelled and filled in", async () => {
    setup("/risks/1/edit", riskForm());
    expect(await screen.findByRole("heading", { name: "ویرایش ریسک", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /عنوان/ })).toHaveValue("ریسک آزمون شماره‌ی ۱");
    expect(screen.getByRole("textbox", { name: /عنوان/ })).toBeRequired();
    expect(screen.getByRole("textbox", { name: /شرح/ })).toHaveValue("شرح آزمونی ریسک.");
    expect(screen.getByRole("combobox", { name: /دسته/ })).toHaveValue("1");
    expect(screen.getByRole("option", { name: "انتخاب کنید" })).toBeInTheDocument();
    const banks = screen.getByRole("group", { name: /بانک‌ها/ });
    expect(banks).toHaveAccessibleDescription("بانک‌هایی که این ریسک به آن‌ها می‌رسد.");
    expect(within(banks).getByRole("checkbox", { name: "بانک آزمون یک" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /تاریخ شناسایی/ })).toHaveValue("1405/08/10");
    expect(screen.getByRole("checkbox", { name: "محرمانه" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "برگشت" })).toHaveAttribute("href", "/risks/1");
    expect(screen.getByRole("link", { name: "انصراف" })).toHaveAttribute("href", "/risks/1");
    await expectNoAxeViolations();
  });

  it("checks required fields before sending and points to them from a focused summary", async () => {
    const { api, user } = setup("/risks/1/edit", riskForm());
    const title = await screen.findByRole("textbox", { name: /عنوان/ });
    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "ذخیره" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("۱ مورد فرم درست نیست:");
    await waitFor(() => expect(summary).toHaveFocus());
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/این فیلد لازم است/);
    expect(api.callsTo("POST forms/")).toHaveLength(0);

    await user.click(within(summary).getByRole("link", { name: /عنوان: این فیلد لازم است/ }));
    expect(title).toHaveFocus();
    // با نوشتن، خطا همان لحظه برداشته می‌شود.
    await user.type(title, "عنوان تازه");
    expect(title).not.toHaveAttribute("aria-invalid");
    await expectNoAxeViolations();
  });

  it("sends the values the way the Django form reads them, then follows Django's redirect", async () => {
    const { api, user, location } = setup("/risks/1/edit", riskForm());
    const title = await screen.findByRole("textbox", { name: /عنوان/ });
    await user.clear(title);
    await user.type(title, "عنوان ویرایش‌شده");
    await user.selectOptions(screen.getByRole("combobox", { name: /دسته/ }), "2");
    await user.click(screen.getByRole("checkbox", { name: "بانک آزمون سه" }));
    const date = screen.getByRole("textbox", { name: /تاریخ شناسایی/ });
    await user.clear(date);
    await user.type(date, "۱۴۰۵/۸/۱");
    await user.click(screen.getByRole("checkbox", { name: "محرمانه" }));
    await user.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(location()).toBe("/risks/1"));
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/risks/1/edit/");
    expect(call!.headers.get("Content-Type")).toBe("application/json");
    expect(call!.body).toEqual({
      values: {
        title: "عنوان ویرایش‌شده",
        description: "شرح آزمونی ریسک.",
        category: "2",
        customers: ["11", "13"],
        identified_on: "1405/08/01",
        is_confidential: true,
        next: "/risks/",
      },
    });
    expect(await screen.findByText("ریسک «ریسک آزمون» ذخیره شد.")).toBeInTheDocument();
  });

  it("puts Django's errors next to their fields and form-wide errors in the summary", async () => {
    const invalid = reply(400, {
      message: "فرم درست نیست.",
      errors: { title: ["ریسکی با همین عنوان هست."], __all__: ["تاریخ شناسایی از امروز جلوتر است."] },
    });
    const { user, location } = setup("/risks/1/edit", riskForm(), invalid);
    await screen.findByRole("textbox", { name: /عنوان/ });
    await user.click(screen.getByRole("button", { name: "ذخیره" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("تاریخ شناسایی از امروز جلوتر است.");
    expect(within(summary).getByRole("link", { name: /عنوان: ریسکی با همین عنوان هست/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /عنوان/ })).toHaveAccessibleDescription(/ریسکی با همین عنوان هست/);
    expect(location()).toBe("/risks/1/edit");
  });

  it("asks before leaving with unsaved changes", async () => {
    const { user, location } = setup("/risks/1/edit", riskForm());
    await user.type(await screen.findByRole("textbox", { name: /عنوان/ }), " تغییر");
    await user.click(screen.getByRole("link", { name: "انصراف" }));
    const dialog = await screen.findByRole("alertdialog", { name: "تغییرات ذخیره نشده است" });
    await user.click(within(dialog).getByRole("button", { name: "ماندن در صفحه" }));
    expect(location()).toBe("/risks/1/edit");

    await user.click(screen.getByRole("link", { name: "انصراف" }));
    await user.click(await screen.findByRole("button", { name: "رفتن بدون ذخیره" }));
    await waitFor(() => expect(location()).toBe("/risks/1"));
  });

  it("uploads a file as multipart after checking its type on this side", async () => {
    const uploaded = {
      message: "پیوست بارگذاری شد.",
      redirect: { href: "/risks/1/#attachments", route: "/risks/1#attachments" },
    };
    const { api, user, location } = setup("/attachments/31/1/new", uploadForm(), uploaded);
    const input = await screen.findByLabelText(/^فایل/);
    expect(screen.getByRole("button", { name: "بارگذاری پیوست" })).toBeInTheDocument();

    // پنجره‌ی انتخاب فایل نوع را محدود می‌کند، ولی رها کردن فایل نه؛ پس فرم خودش هم نوع را می‌سنجد.
    fireEvent.drop(input.parentElement!, { dataTransfer: { files: [new File(["x"], "script.exe")] } });
    expect(screen.getByText("script.exe")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "بارگذاری پیوست" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("این نوع فایل پذیرفته نمی‌شود؛ فقط .pdf، .docx.");
    expect(api.callsTo("POST forms/")).toHaveLength(0);

    await user.upload(input, new File(["%PDF"], "گزارش.pdf", { type: "application/pdf" }));
    await user.type(screen.getByRole("textbox", { name: /شرح/ }), "گزارش آزمون");
    await user.click(screen.getByRole("button", { name: "بارگذاری پیوست" }));

    await waitFor(() => expect(location()).toBe("/risks/1"));
    const [call] = api.callsTo("POST forms/");
    expect(call!.headers.get("Content-Type")).toBeNull();
    expect(call!.headers.get("X-CSRFToken")).not.toBeNull();
    const body = call!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("گزارش.pdf");
    expect(body.get("description")).toBe("گزارش آزمون");
  });

  it("shows a workflow step with its conditions and its own submit label", async () => {
    setup("/workflow/risks/1/transition/start_treatment", transitionForm());
    expect(await screen.findByRole("heading", { name: "شروع اجرا", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("از «برنامه‌ی درمان» به «در اجرا»")).toBeInTheDocument();
    expect(screen.getByText("مالک ریسک هنوز طرح مواجهه را تأیید نکرده است.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RK-1405-0001/ })).toHaveAttribute("href", "/risks/1");
    expect(screen.getByRole("button", { name: "شروع اجرا" })).toHaveAttribute("type", "submit");
    await expectNoAxeViolations();
  });

  it("puts the method's guide tables beside the form, with the facts and warnings Django adds", async () => {
    setup("/assessments/1/initiator", initiatorForm());
    expect(
      await screen.findByRole("heading", { name: "عامل آغازگر (A) در ارزیابی جاری AS-1405-0001", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "برگشت" })).toHaveAttribute("href", "/assessments/1#likelihood");
    expect(screen.getByText(/تعریف آغازگر، واحد شمارش یا دامنه‌ی ریسک کامل نیست/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تکمیل ریسک" })).toHaveAttribute("href", "/risks/1/edit");

    const facts = screen.getByRole("heading", { name: "مرز آغازگر از ریسک RK-1405-0001" }).closest("div.rounded-lg")!;
    expect(within(facts as HTMLElement).getByText("عامل آغازگر").nextSibling).toHaveTextContent("عامل آزمون");
    expect(within(facts as HTMLElement).getByText("خارج از شمارش").nextSibling).toHaveTextContent("-");

    const guide = screen.getByRole("complementary", { name: "راهنمای روش" });
    expect(within(guide).getByRole("heading", { name: "جدول A (بخش ۱۴)" })).toBeInTheDocument();
    const levels = within(guide)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(levels).toEqual(["۱", "۲"]);
    expect(guide).toHaveTextContent("کمتر از ۰.۱ بار در سال");
    expect(guide).toHaveTextContent("یادداشت آزمونی جدول A.");
    expect(screen.getByRole("combobox", { name: /مسیر A/ })).toHaveValue("forward");
    await expectNoAxeViolations();
  });

  it("explains when Django will not show the form in the current state", async () => {
    const blocked = reply(409, {
      message: "ریسک بسته‌شده ویرایش نمی‌شود.",
      redirect: { href: "/risks/1/", route: "/risks/1" },
    });
    setup("/risks/1/edit", blocked);
    expect(await screen.findByRole("heading", { name: "این کار الان ممکن نیست" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ریسک بسته‌شده ویرایش نمی‌شود.");
    expect(screen.getByRole("link", { name: "برگشت" })).toHaveAttribute("href", "/risks/1");
  });
});
