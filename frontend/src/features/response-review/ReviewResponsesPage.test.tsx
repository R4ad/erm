import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { questionnaireResponses } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ReviewResponsesPage } from "./ReviewResponsesPage";

const options = { path: "/identification/responses", route: "/identification/responses" };

describe("بررسی پاسخنامه‌ها (11a)", () => {
  it("صف را با قدیمی‌ترین اول و جدول را با خلاصه‌ی هر وضعیت نشان می‌دهد", async () => {
    mockApi({ "GET questionnaire-responses/": questionnaireResponses() });
    const { container } = renderPage(<ReviewResponsesPage />, options);

    expect(screen.getByRole("heading", { level: 1, name: "بررسی پاسخنامه‌ها" })).toBeInTheDocument();
    const queue = await screen.findByRole("region", { name: "در انتظار بررسی" });
    expect(within(queue).getByText("۱ مورد با دیرکرد")).toBeInTheDocument();
    const cards = within(queue).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    expect(within(cards[0]!).getByText("۴ روز · دیرکرد")).toBeInTheDocument();
    expect(within(cards[1]!).getByText("مهلت امروز")).toBeInTheDocument();
    expect(within(cards[2]!).getByText("۲ روز")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("ارسال ۱۴۰۵/۰۸/۲۷")).toBeInTheDocument();
    const start = within(cards[0]!).getByRole("link", { name: "شروع بررسی" });
    expect(start).toHaveAttribute("href", "/identification/responses/97");
    expect(start).toHaveAccessibleDescription("پایانه‌های فروشگاهی");

    const table = screen.getByRole("table", { name: "همه‌ی پاسخنامه‌ها" });
    const row = (code: string) => within(table).getByText(code).closest("tr")!;
    expect(row("QR-1405-0114")).toHaveTextContent("در حال تکمیل · گام ۴ از ۸");
    expect(within(row("QR-1405-0114")).queryByRole("link")).not.toBeInTheDocument();
    expect(row("QR-1405-0104")).toHaveTextContent("بازگشت: پیامد رویداد ۱ ناقص است");
    expect(row("QR-1405-0098")).toHaveTextContent("۴ مسیر تحقق · ۳ رویداد ← RK-1405-0058");
    expect(row("QR-1405-0097")).toHaveTextContent("۳ مسیر تحقق · ۲ رویداد · ۴ روز دیرکرد");
    expect(row("QR-1405-0088")).toHaveTextContent("۲ مسیر تحقق · ۱ رویداد · همه‌ی پیشنهادها رد شد");
    expect(within(row("QR-1405-0113")).getByRole("link", { name: "بررسی QR-1405-0113" })).toHaveAttribute(
      "href",
      "/identification/responses/113",
    );
    expect(within(row("QR-1405-0098")).getByRole("link", { name: "مشاهده QR-1405-0098" })).toBeInTheDocument();
    expect(screen.getByText("نمایش ۱ تا ۸ از ۳۰ پاسخنامه")).toBeInTheDocument();
    expect(screen.getByText("۳۰ پاسخنامه در دوره‌ی ارزیابی ۱۴۰۵")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("تب، جستجو، واحد و صفحه را در نشانی و درخواست می‌گذارد", async () => {
    const api = mockApi({ "GET questionnaire-responses/": questionnaireResponses() });
    const { user } = renderPage(<ReviewResponsesPage />, options);
    await screen.findByRole("table");

    await user.click(screen.getByRole("tab", { name: /بازگشت برای تکمیل/ }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?status=returned"));
    expect(api.callsTo("GET questionnaire-responses/").at(-1)?.query.get("status")).toBe("returned");

    await user.type(screen.getByRole("searchbox", { name: "جستجوی کد، خدمت یا پاسخ‌دهنده" }), "پایا{Enter}");
    await waitFor(() => expect(api.callsTo("GET questionnaire-responses/").at(-1)?.query.get("q")).toBe("پایا"));

    await user.click(screen.getByRole("button", { name: "همه‌ی واحدها" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "پرداخت الکترونیک" }));
    await waitFor(() => expect(api.callsTo("GET questionnaire-responses/").at(-1)?.query.get("unit")).toBe("4"));

    await user.click(screen.getByRole("button", { name: /صفحه‌ی ۲/ }));
    await waitFor(() => expect(api.callsTo("GET questionnaire-responses/").at(-1)?.query.get("page")).toBe("2"));
  });

  it("«مشاهده‌ی هر ۸ پاسخنامه» تب در انتظار بررسی را باز می‌کند", async () => {
    mockApi({ "GET questionnaire-responses/": questionnaireResponses() });
    const { user } = renderPage(<ReviewResponsesPage />, options);
    await user.click(await screen.findByRole("link", { name: "مشاهده‌ی هر ۸ پاسخنامه" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?status=submitted"));
    expect(screen.getByRole("tab", { name: /در انتظار بررسی/ })).toHaveAttribute("aria-selected", "true");
  });

  it("مدیر واحد صف را نمی‌بیند و جدول خالی پیام دارد", async () => {
    mockApi({
      "GET questionnaire-responses/": questionnaireResponses({
        can_review: false,
        queue: null,
        rows: [],
        page: { number: 1, pages: 1, size: 8, count: 0, start: 0, end: 0 },
      }),
    });
    renderPage(<ReviewResponsesPage />, options);
    expect(await screen.findByText("پاسخنامه‌ای با این جستجو یا فیلتر پیدا نشد.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "در انتظار بررسی" })).not.toBeInTheDocument();
  });

  it("صف خالی پیام تأییدشده را نشان می‌دهد", async () => {
    mockApi({
      "GET questionnaire-responses/": questionnaireResponses({ queue: { count: 0, overdue: 0, cards: [] } }),
    });
    renderPage(<ReviewResponsesPage />, options);
    expect(await screen.findByText("پاسخنامه‌ای در انتظار بررسی نیست.")).toBeInTheDocument();
    expect(screen.queryByText(/مورد با دیرکرد/)).not.toBeInTheDocument();
  });
});
