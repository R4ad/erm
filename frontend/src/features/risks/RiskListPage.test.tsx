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
  const api = mockApi({ "GET risks/": risks, "GET risks/filters/": riskFilters() });
  const view = renderPage(<RiskListPage />, { path, route: "/risks" });
  return { api, ...view, location: () => screen.getByTestId("location").textContent };
}

describe("RiskListPage", () => {
  it("shows the register as an accessible table", async () => {
    setup();
    const table = await screen.findByRole("table", { name: /تازه‌ترین ثبت/ });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("link", { name: "ریسک آزمون شماره‌ی 7" })).toHaveAttribute("href", "/risks/7");
    expect(within(table).getByText("نیازمند تکمیل")).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /ثبت/ })).toHaveAttribute("aria-sort", "descending");
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

  it("filters from the URL, shows chips and removes them", async () => {
    const { user, location } = setup("/risks?status=treatment_plan");
    expect(await screen.findByRole("button", { name: "برداشتن فیلتر وضعیت: برنامه‌ی درمان" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByRole("combobox", { name: "وضعیت" })).toHaveValue("treatment_plan");

    await user.click(screen.getByRole("button", { name: "برداشتن فیلتر وضعیت: برنامه‌ی درمان" }));
    expect(location()).toBe("/risks");
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    await user.selectOptions(screen.getByRole("combobox", { name: "وضعیت" }), "assessment");
    expect(location()).toBe("/risks?status=assessment");
  });

  it("cycles sorting from the column header and resets the page", async () => {
    const { user, location } = setup("/risks?page=2");
    const header = await screen.findByRole("columnheader", { name: /شماره/ });
    await user.click(within(header).getByRole("button"));
    expect(location()).toBe("/risks?ordering=code");
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "ascending"));
    await user.click(within(header).getByRole("button"));
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "descending"));
    expect(screen.getByRole("combobox", { name: "مرتب‌سازی" })).toHaveValue("-code");
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

  it("explains an empty result and clears everything", async () => {
    const { user, location } = setup("/risks?q=نیست");
    expect(await screen.findByText("ریسکی با این فیلترها پیدا نشد")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "پاک کردن فیلترها" }));
    expect(location()).toBe("/risks");
    expect(screen.getByRole("searchbox", { name: "جست‌وجو" })).toHaveValue("");
  });
});
