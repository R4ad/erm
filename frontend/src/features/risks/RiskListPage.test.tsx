import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RiskOrdering } from "@/lib/types";
import type { ApiCall } from "@/test/api";
import { mockApi } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { riskFilters, riskPage } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { RiskListPage } from "./RiskListPage";

/** سرور آزمون: ترتیب و صفحه را همان‌طور که خواسته شده برمی‌گرداند و با q و status فیلتر می‌کند. */
function risks(call: ApiCall) {
  const page = riskPage({ pages: 3, ordering: (call.query.get("ordering") ?? "newest") as RiskOrdering });
  const q = call.query.get("q");
  const status = call.query.get("status");
  page.results = page.results.filter(
    (risk) => (!q || risk.title.includes(q)) && (!status || risk.status.value === status),
  );
  page.page = Number(call.query.get("page") ?? 1);
  page.count = page.results.length;
  return page;
}

function setup(path = "/risks") {
  const api = mockApi({
    "GET risks/": risks,
    "GET risks/filters/": riskFilters(),
    "POST risks/bulk-transition/": {
      done: ["RK-1405-0007"],
      failed: [{ code: "RK-1405-0004", problems: ["مالک ندارد"] }],
    },
  });
  const view = renderPage(<RiskListPage />, { path, route: "/risks" });
  return { api, ...view, location: () => screen.getByTestId("location").textContent };
}

describe("RiskListPage", () => {
  it("shows the register as an accessible table", async () => {
    setup();
    const table = await screen.findByRole("table", { name: /ریسک‌های رجیستر/ });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("link", { name: "ریسک آزمون شماره‌ی ۷" })).toHaveAttribute("href", "/risks/7");
    expect(within(table).getByText("نیازمند تکمیل")).toBeInTheDocument();
    expect(within(table).getByText("مورد جدید")).toBeInTheDocument();
    expect(within(table).getByText("بدون مالک")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "نوشتن طرح مواجهه" })).toHaveAttribute("href", "/risks/1#treatment");
    expect(screen.getByText(/۸ ریسک فعال · ۱ بسته‌شده یا ردشده/)).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("searches as you type, after a pause, and keeps it in the URL", async () => {
    const { api, user, location } = setup();
    await screen.findByRole("table");
    await user.type(screen.getByRole("searchbox", { name: "جست‌وجو" }), "شماره‌ی 4");
    await waitFor(() => expect(location()).toBe("/risks?q=%D8%B4%D9%85%D8%A7%D8%B1%D9%87%E2%80%8C%DB%8C+4"));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    // فقط یک درخواست برای عبارت کامل، نه یکی برای هر حرف.
    expect(api.callsTo("GET risks/").filter((call) => call.query.has("q"))).toHaveLength(1);
  });

  it("filters from the URL, shows chips, tabs and the pipeline, and removes them", async () => {
    const { user, location } = setup("/risks?status=treatment_plan");
    expect(await screen.findByRole("button", { name: "برداشتن فیلتر وضعیت: برنامه‌ی درمان" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByRole("tab", { name: /برنامه‌ی درمان/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /^برنامه‌ی درمان/, pressed: true })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "برداشتن فیلتر وضعیت: برنامه‌ی درمان" }));
    expect(location()).toBe("/risks");
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));
    expect(screen.getByRole("tab", { name: /همه/ })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: /در ارزیابی/, pressed: false }));
    expect(location()).toBe("/risks?status=assessment");
  });

  it("picks several categories and the owner from the filter menus", async () => {
    const { user, location } = setup();
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "دسته" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "T1 دسته‌ی آزمون" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "T3 دسته‌ی سوم" }));
    await user.keyboard("{Escape}");
    expect(location()).toBe("/risks?category=1&category=3");
    expect(screen.getByRole("button", { name: "برداشتن فیلتر دسته: T1، T3" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /بدون مالک/ }));
    expect(location()).toBe("/risks?category=1&category=3&owner=none");
    await user.click(screen.getByRole("button", { name: "پاک کردن همه" }));
    expect(location()).toBe("/risks");
  });

  it("cycles sorting from the column header and resets the page", async () => {
    const { user, location } = setup("/risks?page=2");
    const header = await screen.findByRole("columnheader", { name: /کد/ });
    await user.click(within(header).getByRole("button"));
    expect(location()).toBe("/risks?ordering=code");
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "ascending"));
    await user.click(within(header).getByRole("button"));
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "descending"));
    await user.click(within(header).getByRole("button"));
    expect(location()).toBe("/risks");
  });

  it("pages through results", async () => {
    const { user, location } = setup();
    await user.click(await screen.findByRole("button", { name: "صفحه‌ی ۲" }));
    expect(location()).toBe("/risks?page=2");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "صفحه‌ی ۲" })).toHaveAttribute("aria-current", "page"),
    );
  });

  it("sends selected risks to assessment and reports the ones that could not go", async () => {
    const { api, user } = setup();
    await screen.findByRole("table");
    await user.click(screen.getByRole("checkbox", { name: "انتخاب RK-1405-0007" }));
    await user.click(screen.getByRole("checkbox", { name: "انتخاب RK-1405-0004" }));
    expect(screen.getByText("۲ ریسک انتخاب شده")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /خروجی انتخاب‌شده‌ها/ })).toHaveAttribute(
      "href",
      "/api/risks/export/?ids=7&ids=4",
    );
    await user.click(screen.getByRole("button", { name: "ارسال جهت ارزیابی" }));
    await waitFor(() => expect(api.callsTo("POST risks/bulk-transition/")).toHaveLength(1));
    expect(api.callsTo("POST risks/bulk-transition/")[0]?.body).toEqual({
      ids: [7, 4],
      transition: "send_to_assessment",
    });
    expect(await screen.findByText("RK-1405-0004 فرستاده نشد")).toBeInTheDocument();
  });

  it("explains an empty result and clears everything", async () => {
    const { user, location } = setup("/risks?q=نیست");
    expect(await screen.findByText("ریسکی با این فیلترها پیدا نشد")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "پاک کردن فیلترها" }));
    expect(location()).toBe("/risks");
    expect(screen.getByRole("searchbox", { name: "جست‌وجو" })).toHaveValue("");
  });
});
