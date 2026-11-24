import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { aiRun, responseReview, reviewHistory, reviewRisks } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ResponseReviewPage } from "./ResponseReviewPage";
import { numberList, secondsLeft, serviceTitle } from "./review";

const options = { path: "/identification/responses/109", route: "/identification/responses/:id" };
const empty = { risks: [], counts: { total: 0, approved: 0, dismissed: 0, pending: 0 }, analysed_at: null };

function routes(overrides: Record<string, unknown> = {}) {
  return {
    "GET questionnaire-responses/109/": responseReview(),
    "GET questionnaire-responses/109/risks/": empty,
    "GET questionnaire-responses/109/history/": reviewHistory(),
    ...overrides,
  };
}

describe("بررسی یک پاسخنامه (12a تا 12c)", () => {
  it("پیش از شناسایی، پاسخ‌ها و زنجیره‌ی هر مسیر و کارت شناسایی هوشمند را نشان می‌دهد (12a)", async () => {
    mockApi(routes());
    const { container } = renderPage(<ResponseReviewPage />, options);

    expect(await screen.findByRole("heading", { level: 1, name: "پرداخت اینترنتی" })).toBeInTheDocument();
    expect(screen.getByText("در انتظار بررسی")).toBeInTheDocument();
    expect(screen.getByText("QR-1405-0109").parentElement).toHaveTextContent(
      "QR-1405-0109 · پرداخت الکترونیک · مریم صادقی · ارسال ۲ ساعت پیش",
    );
    expect(screen.getByRole("link", { name: "بازگشت به بررسی پاسخنامه‌ها" })).toHaveAttribute(
      "href",
      "/identification/responses",
    );
    expect(screen.getByRole("link", { name: "پاسخنامه‌ی بعدی" })).toHaveAttribute(
      "href",
      "/identification/responses/110",
    );

    const answers = screen.getByRole("region", { name: "پاسخ‌های پرسشنامه" });
    expect(within(answers).getByText("۷ پرسش · ۳ مسیر تحقق · ۲ پیامد")).toBeInTheDocument();
    expect(within(answers).getByText("داتین یا مشتری")).toBeInTheDocument();
    expect(within(answers).getByText("رویداد ۱ · مشترک با مسیر ۱")).toBeInTheDocument();
    expect(within(answers).getByText("پیامد این مسیر همان پیامد ۱ است")).toBeInTheDocument();
    expect(within(answers).getByText("نوع: عملیاتی · دامنه: سه بانک بزرگ")).toBeInTheDocument();

    const ai = await screen.findByRole("region", { name: "ریسک‌های این پاسخنامه را هوشمند استخراج کنید" });
    expect(within(ai).getByText("حدود ۳۰ ثانیه · پرامپت شناسایی نسخه‌ی ۳")).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "تاریخچه" });
    expect(within(history).getByText("برای بررسی ارسال شد · مریم صادقی")).toBeInTheDocument();
    expect(within(history).getByText("دیروز")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("شناسایی را شروع می‌کند، مرحله‌ها را دنبال می‌کند و با پایانش ریسک‌ها را می‌خواند (12b ← 12c)", async () => {
    let finished = false;
    const api = mockApi(
      routes({
        "POST questionnaire-responses/109/ai-identification/": reply(202, { run_id: 31, run: aiRun({ stage: 2 }) }),
        "GET ai-runs/31/": () => {
          finished = true;
          return aiRun({ status: "succeeded", stage: 5, active: false });
        },
        "GET questionnaire-responses/109/risks/": () => (finished ? reviewRisks() : empty),
      }),
    );
    const { container, user } = renderPage(<ResponseReviewPage />, options);

    await user.click(await screen.findByRole("button", { name: "شناسایی هوشمند ریسک‌ها" }));
    const running = await screen.findByRole("region", { name: "در حال شناسایی ریسک‌ها…" });
    expect(within(running).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(
      within(within(running).getByRole("list")).getByText("تفکیک پیامدهای متمایز · ۲ پیامد ← ۲ ریسک").closest("li"),
    ).toHaveAttribute("aria-current", "step");
    expect(within(running).getByText("مقایسه با ۱۴۸ ریسک ثبت‌شده در رجیستر")).toBeInTheDocument();
    expect(within(running).getByText(/حدود (۳۰|۲۵) ثانیه‌ی دیگر/)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    const results = await screen.findByRole("region", { name: "ریسک‌های پیشنهادی" }, { timeout: 4000 });
    expect(api.callsTo("GET ai-runs/31/").length).toBeGreaterThan(0);
    expect(within(results).getByText(/۱ تأییدشده · ۱ منتظر تصمیم شما · تحلیل ۵ دقیقه پیش/)).toBeInTheDocument();
    expect(within(results).getByText("۳ مسیر تحقق ← ۲ پیامد متمایز ← ۲ ریسک")).toBeInTheDocument();
  });

  it("ریسک پیشنهادی را با منبعش و ریسک تأییدشده را فشرده نشان می‌دهد و مسیرهای منبع را برجسته می‌کند (12c)", async () => {
    mockApi(routes({ "GET questionnaire-responses/109/risks/": reviewRisks() }));
    const { container } = renderPage(<ResponseReviewPage />, options);

    const card = await screen.findByRole("article", { name: "توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک" });
    expect(within(card).getByText("پیش‌نویس AI")).toBeInTheDocument();
    expect(within(card).getByText("اطمینان بالا")).toBeInTheDocument();
    expect(within(card).getByText("پیشنهاد AI")).toBeInTheDocument();
    expect(within(card).getByText("منبع: مسیر ۱ و ۳ ← رویداد ۱ ← پیامد ۱")).toBeInTheDocument();
    expect(within(card).getByText(/مشابه ریسک موجود «قطع درگاه پرداخت بر اثر خرابی لینک»/)).toHaveTextContent(
      "(RK-1405-0047) · ۷۸٪ شباهت",
    );

    const approved = screen.getByRole("heading", {
      level: 3,
      name: "توقف پرداخت اینترنتی در اوج بار تراکنش‌ها",
    }).parentElement!;
    expect(within(approved).getByText("تأیید شد · آنالیز ریسک")).toBeInTheDocument();
    expect(approved).toHaveTextContent("مسیر ۲ ← پیامد ۲ · تأیید توسط سارا محمدی، همین حالا · RK-1405-0061");
    expect(within(approved).getByRole("link", { name: "مشاهده‌ی ریسک" })).toHaveAttribute("href", "/risks/61");

    const answers = screen.getByRole("region", { name: "پاسخ‌های پرسشنامه" });
    expect(within(answers).getAllByText("منبع پیشنهاد انتخاب‌شده")).toHaveLength(2);
    expect(within(answers).getByText("آنالیز ریسک ·").parentElement).toHaveTextContent("RK-1405-0061");
    expect(
      screen.getByText(
        "با تصمیم درباره‌ی همه‌ی ریسک‌ها، پاسخنامه «شناسایی‌شده» می‌شود؛ اگر همه رد شوند، «بررسی‌شده».",
        {
          exact: false,
        },
      ),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("لغو، خطا با کد پیگیری و نتیجه‌ی خالی را نشان می‌دهد (12b)", async () => {
    const api = mockApi(
      routes({
        "GET questionnaire-responses/109/": responseReview({ run: aiRun() }),
        "GET ai-runs/31/": aiRun(),
        "POST ai-runs/31/cancel/": aiRun({ status: "cancelled", active: false }),
      }),
    );
    const { user, unmount } = renderPage(<ResponseReviewPage />, options);
    await user.click(await screen.findByRole("button", { name: "لغو" }));
    expect(await screen.findByText("شناسایی هوشمند لغو شد.")).toBeInTheDocument();
    expect(api.callsTo("POST ai-runs/31/cancel/")).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "شناسایی هوشمند ریسک‌ها" })).toBeInTheDocument();
    unmount();

    const failed = aiRun({ status: "failed", active: false, error_code: "AI-504-7F2A" });
    const retry = mockApi(
      routes({
        "GET questionnaire-responses/109/": responseReview({ run: failed }),
        "POST questionnaire-responses/109/ai-identification/": reply(202, { run_id: 32, run: aiRun({ id: 32 }) }),
        "GET ai-runs/32/": aiRun({ id: 32 }),
      }),
    );
    const second = renderPage(<ResponseReviewPage />, options);
    const error = await screen.findByRole("region", { name: "شناسایی هوشمند انجام نشد" });
    expect(within(error).getByText("AI-504-7F2A")).toBeInTheDocument();
    await expectNoAxeViolations(second.container);
    await second.user.click(within(error).getByRole("button", { name: "تلاش دوباره" }));
    await waitFor(() => expect(retry.callsTo("POST questionnaire-responses/109/ai-identification/")).toHaveLength(1));
    expect(await screen.findByRole("region", { name: "در حال شناسایی ریسک‌ها…" })).toBeInTheDocument();
    second.unmount();

    mockApi(
      routes({
        "GET questionnaire-responses/109/": responseReview({ run: aiRun({ status: "empty", active: false }) }),
      }),
    );
    const third = renderPage(<ResponseReviewPage />, options);
    const none = await screen.findByRole("region", { name: "ریسکی ساخته نشد" });
    expect(within(none).getByRole("link", { name: "ثبت دستی ریسک" })).toHaveAttribute("href", "/identification/manual");
    await expectNoAxeViolations(third.container);
  });

  it("مدیر واحد فقط می‌بیند و بدون پاسخنامه‌ی بعدی پیام صف خالی می‌آید", async () => {
    mockApi(routes({ "GET questionnaire-responses/109/": responseReview({ can_review: false, next: null }) }));
    const { unmount } = renderPage(<ResponseReviewPage />, options);
    await screen.findByRole("region", { name: "تاریخچه" });
    expect(screen.queryByRole("button", { name: "شناسایی هوشمند ریسک‌ها" })).not.toBeInTheDocument();
    expect(screen.queryByText("پاسخنامه‌ی بعدی")).not.toBeInTheDocument();
    unmount();

    mockApi(routes({ "GET questionnaire-responses/109/": responseReview({ next: null }) }));
    const { user } = renderPage(<ResponseReviewPage />, options);
    await user.click(await screen.findByRole("button", { name: "پاسخنامه‌ی بعدی" }));
    expect(await screen.findByText("پاسخنامه‌ی دیگری در صف نیست.")).toBeInTheDocument();
  });

  it("کمک‌تابع‌ها", () => {
    expect(numberList([1])).toBe("۱");
    expect(numberList([1, 3])).toBe("۱ و ۳");
    expect(numberList([1, 2, 3])).toBe("۱، ۲ و ۳");
    expect(serviceTitle("پرداخت اینترنتی (درگاه پرداخت شاپرک)")).toBe("پرداخت اینترنتی");
    expect(serviceTitle("پایانه‌های فروشگاهی")).toBe("پایانه‌های فروشگاهی");
    const start = "2026-11-24T10:00:00Z";
    expect(secondsLeft(start, Date.parse(start))).toBe(30);
    expect(secondsLeft(start, Date.parse(start) + 12_000)).toBe(20);
    expect(secondsLeft(start, Date.parse(start) + 60_000)).toBe(5);
  });
});
