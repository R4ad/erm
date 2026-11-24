import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { controlTest } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ControlTestPage } from "./ControlTestPage";

function render() {
  return renderPage(<ControlTestPage />, { path: "/controls/effectiveness/8", route: "/controls/effectiveness/:pk" });
}

describe("ControlTestPage", () => {
  it("shows the four states, the ladder toward the previous level and the dependent risk", async () => {
    mockApi({ "GET controls/effectiveness/8/test/": controlTest() });
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: "آزمون اثربخشی کنترل CT-0009" })).toBeInTheDocument();
    expect(screen.getByText("اثربخشی محدود · E2")).toBeInTheDocument();
    expect(screen.getByText("قبلی: E3")).toBeInTheDocument();
    const states = screen.getByRole("list", { name: "چهار وضعیت کنترل" });
    expect(within(states).getAllByRole("listitem")).toHaveLength(4);
    expect(within(states).getByText("ناقص")).toBeInTheDocument();

    const ladder = screen.getByRole("list", { name: "سطح‌های E" });
    expect(within(ladder).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
    expect(within(ladder).getByText("هدف · قبلی")).toBeInTheDocument();
    expect(screen.getByText(/برقرار نیست:/).parentElement).toHaveTextContent("مسیر اضطراری باز است");
    expect(screen.getByText(/نرخ موفقیت ۸۳٫۳٪ است/)).toBeInTheDocument();

    const risk = screen.getByRole("article", { name: /RK-1405-0015/ });
    expect(within(risk).getByText("Bc از ۳ به ۴")).toBeInTheDocument();
    expect(within(risk).getByRole("note")).toHaveTextContent("شکست کنترل کلیدی");
    expect(screen.getByRole("list", { name: "ریسک‌های دیگر با همین کنترل" })).toHaveTextContent("بازسنجی");
    expect(screen.getByText("منسوخ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ثبت نتیجه‌ی آزمون/ })).toHaveAttribute(
      "href",
      "/controls/9/effectiveness/new",
    );
    await expectNoAxeViolations(container);
  });

  it("previews the exceptions first and expands to all samples", async () => {
    const user = userEvent.setup();
    mockApi({ "GET controls/effectiveness/8/test/": controlTest() });
    render();

    const table = await screen.findByRole("table", { name: "نتیجه‌ی نمونه‌های آزموده" });
    const rows = () => within(table).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(8);
    expect(within(table).getAllByText("استثنا")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /همه‌ی ۱۲ نمونه/ }));
    expect(rows()).toHaveLength(12);
  });

  it("hides recording actions from those who cannot record tests", async () => {
    mockApi({ "GET controls/effectiveness/8/test/": controlTest({ new_test_url: null, edit_url: null }) });
    render();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: /ثبت نتیجه‌ی آزمون/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /افزودن شاهد/ })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET controls/effectiveness/8/test/": reply(404, { detail: "پیدا نشد" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
