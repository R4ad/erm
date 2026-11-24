import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { orgChartPage } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { OrgChartPage } from "./OrgChartPage";

function render(path = "/units") {
  return renderPage(<OrgChartPage />, { path, route: "/units" });
}

describe("OrgChartPage", () => {
  it("draws the unit tree, the selected unit's detail and its members", async () => {
    mockApi({ "GET org/chart/": orgChartPage() });
    const { container } = render();

    const chart = await screen.findByRole("region", { name: "درخت واحدها، پیمایش افقی" });
    const selected = within(chart).getByRole("button", { pressed: true });
    expect(selected).toHaveTextContent("معاونت فناوری");
    expect(selected).toHaveTextContent("۵ ریسک فعال");
    expect(selected).toHaveTextContent("۲ بحرانی");
    expect(within(chart).getByRole("button", { name: /پرداخت/ })).toHaveTextContent("بدون بحرانی");
    expect(screen.getByText(/۴ واحد · ۳ سطح · ۱۲ کاربر/)).toBeInTheDocument();

    const detail = screen.getByRole("region", { name: "معاونت فناوری" });
    expect(within(detail).getByText("جانشین").nextElementSibling).toHaveTextContent("مهدی فرهادی");
    expect(within(detail).getByText("مشتریان در دامنه").nextElementSibling).toHaveTextContent("بانک ملت، بانک تجارت");
    expect(within(detail).getByText("مرجع پذیرش متوسط").nextElementSibling).toHaveTextContent("نرگس کاظمی");
    expect(within(detail).getByText("همگام با AD")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "ویرایش واحد" })).toHaveAttribute("href", "/units/2/edit");
    expect(within(detail).getByRole("link", { name: "افزودن زیرواحد" })).toHaveAttribute("href", "/units/new?parent=2");
    expect(screen.getByRole("link", { name: "افزودن عضو" })).toHaveAttribute("href", "/accounts/users/new?org_unit=2");

    const members = screen.getByRole("table", { name: "اعضای واحد معاونت فناوری" });
    const rows = within(members).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("مدیر واحد");
    expect(rows[0]).toHaveTextContent("مالک ریسک");
    expect(rows[1]).toHaveTextContent("محلی");
    expect(rows[1]).toHaveTextContent("غیرفعال");
    expect(screen.getByRole("link", { name: /همگام‌سازی با AD/ })).toHaveAttribute("href", "/units/ad-sync");
    await expectNoAxeViolations(container);
  });

  it("selects another unit and dims units that do not match the search", async () => {
    const user = userEvent.setup();
    const api = mockApi({ "GET org/chart/": orgChartPage() });
    render();

    const chart = await screen.findByRole("region", { name: "درخت واحدها، پیمایش افقی" });
    await user.click(within(chart).getByRole("button", { name: /زیرساخت/ }));
    await waitFor(() =>
      expect(api.callsTo("GET org/chart/").some((call) => call.query.get("unit") === "4")).toBe(true),
    );

    await user.type(screen.getByRole("searchbox", { name: "جستجوی واحد یا مدیر" }), "پرداخت");
    expect(within(chart).getByRole("button", { name: /پرداخت/ })).not.toHaveClass("opacity-40");
    expect(within(chart).getByRole("button", { name: /داتین/ })).toHaveClass("opacity-40");
  });

  it("hides editing for users who are not system admins", async () => {
    mockApi({
      "GET org/chart/": orgChartPage({
        can_edit: false,
        add_unit_url: null,
        ad_sync_url: null,
        add_member_url: null,
        selected: { ...orgChartPage().selected!, edit_url: null, add_child_url: null },
      }),
    });
    render();
    await screen.findByRole("region", { name: "درخت واحدها، پیمایش افقی" });
    expect(screen.queryByRole("link", { name: "افزودن واحد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ویرایش واحد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "افزودن عضو" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /همگام‌سازی با AD/ })).toBeDisabled();
  });

  it("shows an error state", async () => {
    mockApi({ "GET org/chart/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
