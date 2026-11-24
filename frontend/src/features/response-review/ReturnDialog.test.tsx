import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { aiRun, responseReview, returnOptions, reviewHistory, reviewRisk, reviewRisks } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ResponseReviewPage } from "./ResponseReviewPage";

// «بازگرداندن پاسخنامه برای تکمیل» (12e): انتخاب و ویرایش پرسش‌ها، پرسش دلخواه، مهلت و یادداشت.

const options = { path: "/identification/responses/109", route: "/identification/responses/:id" };
const FIRST = "در مسیر تحقق ۱، سوئیچ به لینک پشتیبان اکنون چقدر طول می‌کشد و دستی انجام می‌شود یا خودکار؟";
const LAST = "آیا برای اوج بار تراکنش در مناسبت‌ها آزمون بار انجام شده است؟ نتیجه‌ی آخرین آزمون چه بود؟";

function routes(overrides: Record<string, unknown> = {}) {
  return {
    "GET questionnaire-responses/109/": responseReview(),
    "GET questionnaire-responses/109/risks/": reviewRisks(),
    "GET questionnaire-responses/109/history/": reviewHistory(),
    "GET questionnaire-responses/109/return-options/": returnOptions(),
    "POST questionnaire-responses/109/return/": { status: "returned", questions: 3 },
    ...overrides,
  };
}

async function openDialog(user: ReturnType<typeof renderPage>["user"]) {
  await user.click(await screen.findByRole("button", { name: "بازگرداندن برای تکمیل" }));
  return screen.findByRole("dialog", { name: "بازگرداندن پاسخنامه برای تکمیل" });
}

describe("بازگرداندن پاسخنامه برای تکمیل (12e)", () => {
  it("پرسش‌های AI انتخاب‌شده، ویرایش‌شده و دلخواه را با پیام و مهلت می‌فرستد", async () => {
    const api = mockApi(routes());
    const { user } = renderPage(<ResponseReviewPage />, options);
    const dialog = await openDialog(user);

    expect(
      await within(dialog).findByText(
        "پرسش‌های انتخاب‌شده برای مریم صادقی فرستاده می‌شود و وضعیت پاسخنامه «بازگشت برای تکمیل اطلاعات» می‌شود.",
      ),
    ).toBeInTheDocument();
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(4);
    boxes.forEach((box) => expect(box).toBeChecked());
    expect(within(dialog).getByRole("checkbox", { name: FIRST })).toBeChecked();
    expect(within(dialog).getByText("درباره‌ی پیامد ۱ · مسیرهای ۱ و ۳")).toBeInTheDocument();
    expect(within(dialog).getByText("۴ از ۴ پرسش انتخاب شده")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "مهلت تکمیل" })).toHaveDisplayValue(
      "۳ روز کاری · تا ۱۴۰۵/۰۹/۱۰",
    );
    expect(dialog).toHaveTextContent(
      "ریسک تأییدشده‌ی RK-1405-0061 حفظ می‌شود. ۱ پیش‌نویس بررسی‌نشده بایگانی می‌شود و پس از ارسال دوباره‌ی پاسخنامه، شناسایی هوشمند دوباره انجام می‌شود.",
    );
    await expectNoAxeViolations(dialog);

    await user.click(within(dialog).getByRole("checkbox", { name: LAST }));
    expect(within(dialog).getByText("۳ از ۴ پرسش انتخاب شده")).toBeInTheDocument();

    const edit = within(dialog).getAllByRole("button", { name: "ویرایش" })[0]!;
    await user.click(edit);
    expect(edit).toHaveAttribute("aria-pressed", "true");
    const text = within(dialog).getByDisplayValue(FIRST);
    expect(text).toHaveFocus();
    await user.clear(text);
    await user.type(text, "سوئیچ به لینک پشتیبان چقدر طول می‌کشد؟");
    await user.click(edit);
    expect(within(dialog).getByText("سوئیچ به لینک پشتیبان چقدر طول می‌کشد؟")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "افزودن پرسش دلخواه" }));
    const custom = within(dialog).getByPlaceholderText("پرسش خود را بنویسید");
    expect(custom).toHaveFocus();
    await user.type(custom, "قرارداد پشتیبانی دیتاسنتر تا کی اعتبار دارد؟");
    expect(within(dialog).getByText("۴ از ۵ پرسش انتخاب شده")).toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "مهلت تکمیل" }),
      "۵ روز کاری · تا ۱۴۰۵/۰۹/۱۴",
    );

    await user.click(within(dialog).getByRole("button", { name: "بازگرداندن با ۴ پرسش" }));
    expect(
      await screen.findByText("پاسخنامه برای تکمیل به مریم صادقی بازگردانده شد.", { exact: true }),
    ).toBeInTheDocument();
    expect(api.callsTo("POST questionnaire-responses/109/return/")[0]?.body).toEqual({
      questions: [
        { text: "سوئیچ به لینک پشتیبان چقدر طول می‌کشد؟", ref: "P1", source: "ai" },
        { text: expect.stringContaining("زیان مالی هر ساعت") as string, ref: "I1", source: "ai" },
        { text: expect.stringContaining("تصمیم ارتقای زیرساخت") as string, ref: "Q4", source: "ai" },
        { text: "قرارداد پشتیبانی دیتاسنتر تا کی اعتبار دارد؟", ref: "", source: "custom" },
      ],
      message: "لطفاً پرسش‌های زیر را تکمیل کنید تا سناریوهای ریسک این خدمت دقیق‌تر ثبت شوند.",
      due_date: "2026-12-05",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("بی‌پیشنهاد AI با یک پرسش دلخواه باز می‌شود و بی‌پرسش یا با مهلت نادرست فرستاده نمی‌شود", async () => {
    const api = mockApi(
      routes({
        "GET questionnaire-responses/109/return-options/": returnOptions({ suggestions: [], approved: [], pending: 0 }),
        "POST questionnaire-responses/109/return/": reply(400, {
          errors: { due_date: ["مهلت باید روز کاری بعد از امروز باشد."] },
        }),
      }),
    );
    const { user } = renderPage(<ResponseReviewPage />, options);
    const dialog = await openDialog(user);

    const custom = await within(dialog).findByPlaceholderText("پرسش خود را بنویسید");
    expect(within(dialog).queryByText(/پیشنهادهای AI از روی ابهام‌ها/)).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("پس از ارسال دوباره‌ی پاسخنامه، شناسایی هوشمند دوباره انجام می‌شود.");
    expect(dialog).not.toHaveTextContent("حفظ می‌شود");

    await user.click(within(dialog).getByRole("button", { name: "بازگرداندن با ۰ پرسش" }));
    expect(within(dialog).getByText("دست‌کم یک پرسش انتخاب کنید.")).toBeInTheDocument();
    expect(api.callsTo("POST questionnaire-responses/109/return/")).toHaveLength(0);

    await user.type(custom, "قرارداد پشتیبانی تا کی اعتبار دارد؟");
    expect(within(dialog).queryByText("دست‌کم یک پرسش انتخاب کنید.")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "بازگرداندن با ۱ پرسش" }));
    expect(await within(dialog).findByText("مهلت باید روز کاری بعد از امروز باشد.")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "مهلت تکمیل" })).toHaveAttribute("aria-invalid", "true");

    // پرسش دلخواهی که خالی بماند با پایان ویرایش کنار می‌رود.
    await user.clear(custom);
    await user.click(within(dialog).getByRole("button", { name: "ویرایش" }));
    expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dialog).getByRole("button", { name: "افزودن پرسش دلخواه" })).toHaveFocus();
  });

  it("تأیید در انتظار بازگردانی پیش از خواندن گزینه‌ها ثبت می‌شود", async () => {
    const api = mockApi(routes({ "POST pending-risks/501/approve/": reviewRisk() }));
    const { user } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: "توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک" });
    await user.click(within(card).getByRole("button", { name: "تأیید و ارسال به آنالیز" }));
    await openDialog(user);

    const order = api.calls.map((call) => `${call.method} ${call.path}`);
    const approve = order.indexOf("POST pending-risks/501/approve/");
    expect(approve).toBeGreaterThan(-1);
    expect(order.indexOf("GET questionnaire-responses/109/return-options/")).toBeGreaterThan(approve);
  });

  it("در حالت «ریسکی ساخته نشد» هم بازگرداندن هست و بیننده‌ی بدون اختیار آن را نمی‌بیند", async () => {
    mockApi(
      routes({
        "GET questionnaire-responses/109/": responseReview({ run: aiRun({ status: "empty", active: false }) }),
        "GET questionnaire-responses/109/risks/": reviewRisks({ risks: [] }),
      }),
    );
    const { user, unmount } = renderPage(<ResponseReviewPage />, options);
    const none = await screen.findByRole("region", { name: "ریسکی ساخته نشد" });
    await user.click(within(none).getByRole("button", { name: "بازگرداندن برای تکمیل" }));
    expect(await screen.findByRole("dialog", { name: "بازگرداندن پاسخنامه برای تکمیل" })).toBeInTheDocument();
    unmount();

    mockApi(routes({ "GET questionnaire-responses/109/": responseReview({ can_review: false }) }));
    renderPage(<ResponseReviewPage />, options);
    await screen.findByRole("region", { name: "تاریخچه" });
    expect(screen.queryByRole("button", { name: "بازگرداندن برای تکمیل" })).not.toBeInTheDocument();
  });
});
