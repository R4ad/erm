import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { methodPage } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { MethodPage } from "./MethodPage";
import { Paragraphs } from "./paragraphs";

// روش ارزیابی فقط خواندنی است: مقیاس‌ها، جدول L، قاعده‌های Bc، ماتریس تصمیم، قواعد هر سطح و پارامترها همه از
// نسخه‌ای که جنگو برمی‌گرداند.

function pageAt(djangoPath: string, data: unknown) {
  return mockApi({
    "GET pages/": (call: ApiCall) => (call.query.get("path") === djangoPath ? data : reply(404, {})),
  });
}

describe("Paragraphs", () => {
  it("splits on blank lines, turns ## into a heading and keeps any HTML as plain text", () => {
    const { container } = render(
      <Paragraphs text={"بند اول\nخط دوم\n\n## عنوان\n\n<img src=x onerror=alert(1)> بند سوم\n\n\n"} level={4} />,
    );
    expect(screen.getByRole("heading", { name: "عنوان", level: 4 })).toBeInTheDocument();
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent("بند اول خط دوم");
    expect(paragraphs[1]!.textContent).toBe("<img src=x onerror=alert(1)> بند سوم");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders nothing for empty text", () => {
    const { container } = render(<Paragraphs text={"  \n\n "} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MethodPage", () => {
  it("shows the active version with its scales, tables, levels and parameters", async () => {
    pageAt("/method/", methodPage());
    const { user } = renderPage(<MethodPage />, { path: "/method" });
    expect(await screen.findByRole("heading", { name: "روش ارزیابی", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("نسخه‌ی ۱: روش v5")).toBeInTheDocument();
    expect(screen.getByText("نسخه‌ی آزمایشی")).toBeInTheDocument();
    expect(screen.queryByText(/این نسخه فعال نیست/)).not.toBeInTheDocument();

    // متن راهنما بند به بند، با عنوان‌هایش.
    expect(screen.getByRole("heading", { name: "قواعد تقدم بر امتیاز", level: 3 })).toBeInTheDocument();

    const a = screen.getByRole("table", { name: "سطح‌های A: عامل آغازگر" });
    expect(within(a).getByRole("columnheader", { name: "مرز عددی" })).toBeInTheDocument();
    expect(a).toHaveTextContent("کمتر از 0.1 بار در سال");

    const bc = screen.getByRole("table", { name: "قاعده‌های Bc" });
    const none = within(bc).getByText("هیچ‌کدام از شرط‌های بالا برقرار نیست").closest("tr")!;
    expect(none).toHaveTextContent("۵");

    const grid = screen.getByRole("table", { name: /L برای هر ترکیب A/ });
    const a5 = within(grid).getByRole("rowheader", { name: "A5" }).closest("tr")!;
    expect(
      within(a5)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["L2", "L3", "L4", "L5", "L5"]);

    const matrix = screen.getByRole("table", { name: /سطح تصمیم برای هر احتمال/ });
    const l1 = within(matrix).getByRole("rowheader", { name: "L1" }).closest("tr")!;
    const cells = within(l1).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("پایین");
    expect(cells[4]).toHaveTextContent("بالا");
    expect(cells[4]).toHaveTextContent("۵ · کف");

    const rules = screen.getByRole("table", { name: /تصمیم، امضا و مهلت‌های هر سطح/ });
    const critical = within(rules).getByText("بحرانی").closest("tr")!;
    expect(critical).toHaveTextContent("۲۴ ساعت");
    expect(critical).toHaveTextContent("کمیته امنیت");

    expect(screen.getByRole("table", { name: "پارامترهای این نسخه" })).toHaveTextContent("افق پیش‌فرض ارزیابی");
    expect(screen.getByText("I = max(S, F)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "نسخه‌های دیگر" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /نسخه‌ی ۲/ })).toHaveAttribute("href", "/method/2");
    expect(within(menu).getByRole("menuitem", { name: /نسخه‌ی ۱/ })).toHaveAttribute("aria-current", "page");
    await user.keyboard("{Escape}");
    await expectNoAxeViolations();
  });

  it("points a non-active version to the active one", async () => {
    const data = methodPage();
    pageAt("/method/2/", {
      ...data,
      version: {
        ...data.version,
        number: 2,
        name: "نسخه‌ی 2: بازنگری پارامترها",
        status: { value: "draft", label: "پیش‌نویس" },
        is_trial: false,
        based_on: "نسخه‌ی 1: روش v5",
        activated_at: null,
      },
    });
    renderPage(<MethodPage />, { path: "/method/2", route: "/method/:number" });
    expect(await screen.findByText(/این نسخه فعال نیست/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "نسخه‌ی فعال" })).toHaveAttribute("href", "/method");
    expect(screen.queryByText("نسخه‌ی آزمایشی")).not.toBeInTheDocument();
    expect(screen.getByText("نسخه‌ی ۱: روش v5")).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
