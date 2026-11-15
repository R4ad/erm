import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { mockApi } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { managementReport } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ManagementReportPage } from "./ManagementReportPage";

function setup(path = "/reports") {
  const api = mockApi({
    "GET reports/management/": (call: ApiCall) => managementReport(Number(call.query.get("months") ?? 6)),
  });
  const view = renderPage(<ManagementReportPage />, { path, route: "/reports" });
  return { api, ...view, location: () => screen.getByTestId("location").textContent };
}

describe("ManagementReportPage", () => {
  it("shows the Figma report sections from the server's counts", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "گزارش مدیریتی", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("ریسک‌های فعال").parentElement?.nextElementSibling).toHaveTextContent("۱۶");
    expect(screen.getByText("پوشش خدمات حیاتی").parentElement?.nextElementSibling).toHaveTextContent("۵۰٪");

    const distribution = screen.getByRole("region", { name: "توزیع سطح تصمیم" });
    expect(within(distribution).getByText("افزایش", { exact: false }).parentElement).toHaveTextContent("۳");

    const matrix = screen.getByRole("table", { name: /احتمال \(L\) و پیامد \(I\)/ });
    expect(within(matrix).getByText(/ریسک در L4 و I5/).parentElement).toHaveTextContent("۲");
    expect(screen.getByText(/۷ ریسک بدون ارزیابی جاری در ماتریس نیست/)).toBeInTheDocument();

    const overdue = screen.getByRole("region", { name: "اقدام‌های معوق بالا و بحرانی" });
    expect(within(overdue).getByRole("link", { name: "TR-1405-0009" })).toHaveAttribute("href", "/actions/28");
    expect(within(overdue).getByText("۳ روز تأخیر")).toBeInTheDocument();

    const changes = screen.getByRole("region", { name: "تغییر سطح در دوره" });
    expect(within(changes).getByText("پس از اقدام")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "تمرکز وابستگی و نقطه‌ی شکست مشترک" })).toHaveTextContent("۷ ریسک");
    expect(screen.getByRole("link", { name: /خروجی Excel/ })).toHaveAttribute(
      "href",
      "/api/reports/management/export/?months=6",
    );
    await expectNoAxeViolations();
  });

  it("changes the period and keeps it in the URL", async () => {
    const { api, user, location } = setup();
    await user.click(await screen.findByRole("button", { name: /دوره‌ی تغییرات: ۶ ماه اخیر/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "یک سال اخیر" }));
    expect(await screen.findByRole("button", { name: /دوره‌ی تغییرات: یک سال اخیر/ })).toBeInTheDocument();
    expect(location()).toContain("months=12");
    expect(api.calls.some((call) => call.query.get("months") === "12")).toBe(true);
  });
});
