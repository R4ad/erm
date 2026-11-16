import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { OrgChartPage as PageData, OrgNode } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { OrgChartPage } from "./OrgChartPage";

function node(id: number, name: string, extra: Partial<OrgNode> = {}): OrgNode {
  return {
    id,
    code: `U${id}`,
    name,
    depth: 1,
    manager: { id: id + 100, name: `مدیر ${name}` },
    manager_title: "",
    risks: 0,
    critical: 0,
    children: [],
    ...extra,
  };
}

function page(changes: Partial<PageData> = {}): PageData {
  return {
    summary: { units: 4, levels: 3, users: 12 },
    tree: [
      node(1, "داتین", {
        depth: 0,
        risks: 9,
        critical: 2,
        children: [
          node(2, "معاونت فناوری", { risks: 5, critical: 2, children: [node(4, "زیرساخت", { depth: 2, risks: 3 })] }),
          node(3, "پرداخت", { risks: 4 }),
        ],
      }),
    ],
    selected: {
      id: 2,
      code: "U2",
      name: "معاونت فناوری",
      active: true,
      ad_group: "OU=Tech",
      parent: "داتین",
      manager: { id: 102, name: "علی رضایی" },
      deputy: { id: 7, name: "مهدی فرهادی" },
      services: ["شبکه‌ی مرکزی"],
      customers: ["بانک ملت", "بانک تجارت"],
      acceptance: "مدیر بالادست: نرگس کاظمی",
      levels: [
        { rank: 4, name: "بحرانی", count: 2 },
        { rank: 3, name: "بالا", count: 1 },
        { rank: 2, name: "متوسط", count: 2 },
        { rank: 1, name: "پایین", count: 0 },
      ],
      edit_url: "/units/2/edit/",
      add_child_url: "/units/new/?parent=2",
    },
    members: [
      {
        id: 102,
        name: "علی رضایی",
        username: "ali",
        initials: "عر",
        job_title: "مدیر فناوری",
        roles: [
          { label: "مدیر واحد", tone: "info" },
          { label: "مالک ریسک", tone: "warning" },
        ],
        source: { value: "ad", label: "AD" },
        active: true,
      },
      {
        id: 7,
        name: "مهدی فرهادی",
        username: "mehdi",
        initials: "مف",
        job_title: "",
        roles: [{ label: "کارشناس", tone: "neutral" }],
        source: { value: "local", label: "محلی" },
        active: false,
      },
    ],
    can_edit: true,
    add_unit_url: "/units/new/",
    add_member_url: "/admin/accounts/user/add/",
    ...changes,
  };
}

function render(path = "/units") {
  return renderPage(<OrgChartPage />, { path, route: "/units" });
}

describe("OrgChartPage", () => {
  it("draws the unit tree, the selected unit's detail and its members", async () => {
    mockApi({ "GET org/chart/": page() });
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

    const members = screen.getByRole("table", { name: "اعضای واحد معاونت فناوری" });
    const rows = within(members).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("مدیر واحد");
    expect(rows[0]).toHaveTextContent("مالک ریسک");
    expect(rows[1]).toHaveTextContent("محلی");
    expect(rows[1]).toHaveTextContent("غیرفعال");
    expect(screen.getByRole("button", { name: /همگام‌سازی با AD/ })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it("selects another unit and dims units that do not match the search", async () => {
    const user = userEvent.setup();
    const api = mockApi({ "GET org/chart/": page() });
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
      "GET org/chart/": page({
        can_edit: false,
        add_unit_url: null,
        add_member_url: null,
        selected: { ...page().selected!, edit_url: null, add_child_url: null },
      }),
    });
    render();
    await screen.findByRole("region", { name: "درخت واحدها، پیمایش افقی" });
    expect(screen.queryByRole("link", { name: "افزودن واحد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ویرایش واحد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "افزودن عضو" })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET org/chart/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
