import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  aiRun,
  decisionOptions,
  responseReview,
  reviewHistory,
  reviewRisk,
  reviewRisks,
  riskComparison,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ResponseReviewPage } from "./ResponseReviewPage";
import { withApprovals } from "./review";

// اقدام‌های 12c و 12d: تأیید با ۱۰ ثانیه بازگردانی، رد با دلیل، ویرایش، مقایسه و تحلیل دوباره.

const options = { path: "/identification/responses/109", route: "/identification/responses/:id" };
const TITLE = "توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک";

function routes(overrides: Record<string, unknown> = {}) {
  return {
    "GET questionnaire-responses/109/": responseReview(),
    "GET questionnaire-responses/109/risks/": reviewRisks(),
    "GET questionnaire-responses/109/history/": reviewHistory(),
    "GET questionnaire-responses/109/decision-options/": decisionOptions(),
    ...overrides,
  };
}

describe("تصمیم درباره‌ی ریسک‌های پیشنهادی (12c و 12d)", () => {
  it("تأیید را تا بسته شدن پیام بازگردانی نگه می‌دارد و «بازگردانی» آن را بی‌درخواست برمی‌گرداند", async () => {
    const api = mockApi(routes({ "POST pending-risks/501/approve/": reviewRisk() }));
    const { user } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    await user.click(within(card).getByRole("button", { name: "تأیید و ارسال به آنالیز" }));
    expect(await screen.findByText("ریسک تأیید شد و به آنالیز ریسک رفت")).toBeInTheDocument();
    const results = screen.getByRole("region", { name: "ریسک‌های پیشنهادی" });
    expect(within(results).getByText(/۲ تأییدشده · ۰ منتظر تصمیم شما/)).toBeInTheDocument();
    expect(within(results).getByRole("heading", { level: 3, name: TITLE }).parentElement).toHaveTextContent(
      "مسیر ۱ و ۳ ← پیامد ۱ · تأیید توسط کاربر آزمون، همین حالا",
    );

    await user.click(screen.getByRole("button", { name: "بازگردانی" }));
    expect(await screen.findByText("تأیید ریسک بازگردانده شد.")).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: TITLE })).toBeInTheDocument();
    expect(api.callsTo("POST pending-risks/501/approve/")).toHaveLength(0);
  });

  it("با بسته شدن پیام، تأیید فرستاده و ریسک‌ها دوباره خوانده می‌شوند؛ خطا ریسک را منتظر برمی‌گرداند", async () => {
    const api = mockApi(
      routes({
        "POST pending-risks/501/approve/": reply(409, { message: "این ریسک پیشنهادی دیگر منتظر تصمیم نیست." }),
      }),
    );
    const { user } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    await user.click(within(card).getByRole("button", { name: "تأیید و ارسال به آنالیز" }));
    const toast = (await screen.findByText("ریسک تأیید شد و به آنالیز ریسک رفت")).closest("li")!;
    await user.click(within(toast).getByRole("button", { name: "بستن" }));

    await waitFor(() => expect(api.callsTo("POST pending-risks/501/approve/")).toHaveLength(1));
    expect(api.callsTo("POST pending-risks/501/approve/")[0]?.body).toEqual({});
    expect(await screen.findByText("ثبت ریسک انجام نشد؛ ریسک دوباره منتظر تصمیم شماست.")).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: TITLE })).toBeInTheDocument();
    expect(api.callsTo("GET questionnaire-responses/109/risks/").length).toBeGreaterThan(1);
  });

  it("رد دلیل می‌خواهد و با دلیل فرستاده می‌شود", async () => {
    const api = mockApi(routes({ "POST pending-risks/501/reject/": reviewRisk() }));
    const { user, container } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    await user.click(within(card).getByRole("button", { name: "رد" }));
    const dialog = screen.getByRole("alertdialog", { name: "رد ریسک پیشنهادی" });
    expect(dialog).toHaveAccessibleDescription(
      `«${TITLE}» وارد رجیستر نمی‌شود و با دلیل شما در تاریخچه‌ی پاسخنامه می‌ماند.`,
    );
    await user.click(within(dialog).getByRole("button", { name: "رد ریسک" }));
    const reason = within(dialog).getByRole("textbox", { name: /^دلیل رد/ });
    expect(reason).toHaveAccessibleDescription("دلیل رد را بنویسید.");
    expect(reason).toHaveFocus();
    expect(api.callsTo("POST pending-risks/501/reject/")).toHaveLength(0);
    await expectNoAxeViolations(container);

    await user.type(within(dialog).getByRole("textbox"), "تکراری با ریسک RK-1405-0047");
    await user.click(within(dialog).getByRole("button", { name: "رد ریسک" }));
    expect(await screen.findByText("ریسک پیشنهادی رد شد.")).toBeInTheDocument();
    expect(api.callsTo("POST pending-risks/501/reject/")[0]?.body).toEqual({ reason: "تکراری با ریسک RK-1405-0047" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("کشوی ویرایش پیشنهاد AI را نشان می‌دهد، بازمی‌گرداند و ذخیره می‌کند (12d)", async () => {
    const api = mockApi(
      routes({
        "PATCH pending-risks/501/": (call: { body: unknown }) =>
          (call.body as { paths: { text: string }[] }).paths[0]?.text
            ? reviewRisk()
            : reply(400, { message: "", errors: { "paths.1": ["شرح این مسیر تحقق را بنویسید."] } }),
      }),
    );
    const { user } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    await user.click(within(card).getByRole("button", { name: "ویرایش" }));
    const drawer = screen.getByRole("dialog", { name: "ویرایش ریسک پیشنهادی" });
    expect(drawer).toHaveAccessibleDescription(
      "تغییرات شما در تاریخچه‌ی ریسک ثبت می‌شود و مقدار پیشنهادی AI هر زمان قابل بازگردانی است.",
    );
    expect(within(drawer).getByText("پیش‌نویس AI")).toBeInTheDocument();
    expect(within(drawer).getByText("۲ مسیر به این پیامد می‌رسد")).toBeInTheDocument();
    expect(within(drawer).getByText("نوع: مالی و اعتباری · دامنه: همه‌ی بانک‌های طرف قرارداد")).toBeInTheDocument();
    expect(within(drawer).getByText("QR-1405-0109")).toBeInTheDocument();

    const title = within(drawer).getByRole("textbox", { name: /^عنوان ریسک/ });
    await user.type(title, " و دیتاسنتر");
    expect(title).toHaveAccessibleDescription(`ویرایش‌شده · پیشنهاد AI: «${TITLE}»`);
    await user.click(within(drawer).getByRole("button", { name: "بازگرداندن پیشنهاد AI" }));
    expect(title).toHaveValue(TITLE);
    expect(within(drawer).queryByRole("button", { name: "بازگرداندن پیشنهاد AI" })).not.toBeInTheDocument();

    const unit = await within(drawer).findByRole("combobox", { name: /^مالک ریسک\s*\*?\s*(اجباری)?$/ });
    await waitFor(() => expect(unit).toBeEnabled());
    await user.selectOptions(unit, "زیرساخت");
    expect(within(drawer).getByRole("combobox", { name: "مالک ریسک (شخص)" })).toHaveValue("9");
    await expectNoAxeViolations(drawer);

    await user.clear(within(drawer).getByRole("textbox", { name: "مسیر تحقق ۱" }));
    await user.click(within(drawer).getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    expect(await within(drawer).findByText("شرح این مسیر تحقق را بنویسید.")).toBeInTheDocument();
    expect(within(drawer).getByRole("textbox", { name: "مسیر تحقق ۱" })).toHaveAttribute("aria-invalid", "true");

    await user.type(within(drawer).getByRole("textbox", { name: "مسیر تحقق ۱" }), "قطعی لینک اصلی");
    await user.click(within(drawer).getByRole("button", { name: "ذخیره‌ی پیش‌نویس" }));
    expect(await screen.findByText("تغییرات ریسک پیشنهادی ذخیره شد.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "ویرایش ریسک پیشنهادی" })).not.toBeInTheDocument();
    expect(api.callsTo("PATCH pending-risks/501/").at(-1)?.body).toMatchObject({
      title: TITLE,
      paths: [
        { number: 1, text: "قطعی لینک اصلی" },
        { number: 3, text: "خرابی تجهیزات شبکه‌ی دیتاسنتر و نبود افزونگی" },
      ],
      category: 1,
      owner_unit: 5,
      owner: 9,
    });
  });

  it("«ذخیره و تأیید» اول ذخیره می‌کند و بعد تأیید با بازگردانی را شروع می‌کند", async () => {
    const api = mockApi(routes({ "PATCH pending-risks/501/": reviewRisk() }));
    const { user } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    await user.click(within(card).getByRole("button", { name: "ویرایش" }));
    const drawer = screen.getByRole("dialog", { name: "ویرایش ریسک پیشنهادی" });
    await user.click(within(drawer).getByRole("button", { name: "ذخیره و تأیید" }));
    expect(await screen.findByText("ریسک تأیید شد و به آنالیز ریسک رفت")).toBeInTheDocument();
    expect(api.callsTo("PATCH pending-risks/501/")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("مقایسه با ریسک موجود را کنار هم نشان می‌دهد", async () => {
    mockApi(routes({ "GET pending-risks/501/similar/": riskComparison() }));
    const { user } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    await user.click(within(card).getByRole("button", { name: "مقایسه با ریسک موجود" }));
    const dialog = screen.getByRole("dialog", { name: "مقایسه با ریسک موجود" });
    expect(dialog).toHaveAccessibleDescription("۷۸٪ شباهت · ادغام در این نسخه انجام نمی‌شود.");
    const table = await within(dialog).findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "ریسک پیشنهادی" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "ریسک موجود · RK-1405-0047" })).toBeInTheDocument();
    expect(within(table).getByText("قطع درگاه پرداخت بر اثر خرابی لینک")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "مشاهده‌ی ریسک" })).toHaveAttribute("href", "/risks/47");
    await expectNoAxeViolations(dialog);
  });

  it("تحلیل دوباره پس از تأیید، تأییدهای منتظر را می‌فرستد و شناسایی را از نو شروع می‌کند", async () => {
    const api = mockApi(
      routes({
        "POST pending-risks/501/approve/": reviewRisk(),
        "POST questionnaire-responses/109/ai-identification/": reply(202, { run_id: 31, run: aiRun({ stage: 1 }) }),
        "GET ai-runs/31/": aiRun({ stage: 1 }),
      }),
    );
    const { user } = renderPage(<ResponseReviewPage />, options);

    const results = await screen.findByRole("region", { name: "ریسک‌های پیشنهادی" });
    await user.click(within(results).getByRole("button", { name: "تحلیل دوباره" }));
    const dialog = screen.getByRole("alertdialog", { name: "تحلیل دوباره‌ی پاسخنامه" });
    expect(dialog).toHaveAccessibleDescription(
      "۱ پیش‌نویس بررسی‌نشده بایگانی و دوباره ساخته می‌شود. ریسک‌های تأییدشده و ردشده تغییری نمی‌کنند.",
    );
    await user.click(within(dialog).getByRole("button", { name: "انصراف" }));

    await user.click(screen.getByRole("button", { name: "تأیید و ارسال به آنالیز" }));
    await user.click(screen.getByRole("button", { name: "تحلیل دوباره" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "تحلیل دوباره" }));
    expect(await screen.findByRole("region", { name: "در حال شناسایی ریسک‌ها…" })).toBeInTheDocument();
    const order = api.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.indexOf("POST pending-risks/501/approve/")).toBeGreaterThan(-1);
    expect(order.indexOf("POST pending-risks/501/approve/")).toBeLessThan(
      order.indexOf("POST questionnaire-responses/109/ai-identification/"),
    );
  });

  it("مدیر واحد اقدامی نمی‌بیند", async () => {
    mockApi(routes({ "GET questionnaire-responses/109/": responseReview({ can_review: false }) }));
    renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: TITLE });
    expect(within(card).queryByRole("button", { name: "تأیید و ارسال به آنالیز" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحلیل دوباره" })).not.toBeInTheDocument();
  });

  it("withApprovals تأییدهای منتظر را تأییدشده و بی‌کد نشان می‌دهد و شمارها را از نو می‌شمارد", () => {
    const data = reviewRisks();
    expect(withApprovals(data, new Map(), { id: 3, name: "کاربر آزمون" })).toBe(data);
    const shown = withApprovals(data, new Map([[501, "2026-11-24T08:00:00Z"]]), { id: 3, name: "کاربر آزمون" });
    expect(shown.counts).toEqual({ total: 2, approved: 2, dismissed: 0, pending: 0 });
    expect(shown.risks[0]).toMatchObject({
      status: { value: "converted", label: "تأیید شد · آنالیز ریسک" },
      decided_by: { id: 3, name: "کاربر آزمون" },
      risk: null,
    });
  });
});
