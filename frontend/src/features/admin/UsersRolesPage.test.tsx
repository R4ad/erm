import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { DirectoryRole, DirectoryUser, UsersRolesPage as PageData } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { UsersRolesPage } from "./UsersRolesPage";

function user(id: number, name: string, extra: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    id,
    name,
    username: `u${id}`,
    unit: "واحد ریسک",
    job_title: "",
    roles: [],
    customers: null,
    source: { value: "ad", label: "AD" },
    last_login: { iso: "2026-11-16T09:12:00+03:30", label: "امروز ۰۹:۱۲" },
    status: { value: "active", label: "فعال", tone: "success" },
    edit_url: `/admin/accounts/user/${id}/change/`,
    ...extra,
  };
}

function role(key: string, label: string, extra: Partial<DirectoryRole> = {}): DirectoryRole {
  return {
    key,
    label,
    tone: "info",
    description: `شرح ${label}`,
    kind: "group",
    kind_label: "گروه دسترسی",
    scope: { value: "all", label: "همه‌ی واحدها" },
    count: 1,
    acceptance: [],
    edit_url: `/admin/auth/group/${key}/change/`,
    ...extra,
  };
}

function page(): PageData {
  const owner = { key: "owner", label: "مالک ریسک", tone: "warning" as const };
  const analyst = { key: "analyst", label: "کارشناس ریسک", tone: "info" as const };
  const users = [
    user(1, "سارا محمدی", { roles: [analyst], source: { value: "local", label: "محلی" } }),
    user(2, "علی رضایی", {
      roles: [owner],
      customers: ["بانک ملت"],
      status: { value: "sod", label: "تعارض SoD", tone: "warning" },
    }),
    ...Array.from({ length: 8 }, (_, index) => user(10 + index, `کاربر ${index + 1}`, { roles: [owner] })),
  ];
  return {
    summary: { active: 10, units: 4, ad: 9, local: 1, temporary: 0, roles: 2, conflicts: 1 },
    users,
    roles: [
      role("analyst", "کارشناس ریسک"),
      role("owner", "مالک ریسک", {
        kind: "derived",
        kind_label: "از روی سوابق",
        scope: { value: "unit", label: "واحد خود و زیرواحدها" },
        count: 9,
        edit_url: null,
        acceptance: [
          { levels: ["پایین"], label: "سطح پایین", text: "پذیرش مستقل · ۱۲ ماه", tone: "success" },
          { levels: ["بالا", "بحرانی"], label: "بالا و بحرانی", text: "فقط پیشنهاد به کمیته امنیت", tone: "warning" },
        ],
      }),
    ],
    matrix: [
      { key: "analysis", label: "تحلیل و امتیازدهی A، B، I", stage: "آنالیز", access: { analyst: "F", owner: "L" } },
      { key: "method", label: "ویرایش متدولوژی", stage: "پیکربندی", access: {} },
    ],
    sod: {
      conflicts: [
        {
          key: "owner-control-2",
          user: { id: 2, name: "علی رضایی" },
          title: "مالک ریسک + مسئول کنترل",
          note: "مالک RK-1 و مسئول CT-1 در همان مسیر",
          state: "open",
          href: "/risks/2/",
        },
      ],
      rules: [{ text: "مجری اقدام نمی‌تواند تأییدکننده‌ی اثربخشی همان اقدام باشد.", where: "قید پایگاه داده" }],
    },
    add_user_url: "/admin/accounts/user/add/",
    login_report_url: "/audit/?event=login",
    import_url: "/accounts/staff-import/",
  };
}

function render() {
  return renderPage(<UsersRolesPage />, { path: "/accounts/users", route: "/accounts/users" });
}

describe("UsersRolesPage", () => {
  it("shows users, the access matrix, separation of duties and the selected role", async () => {
    mockApi({ "GET accounts/roles/": page() });
    const { container } = render();

    const table = await screen.findByRole("table", { name: "کاربران سامانه" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(8);
    expect(rows[1]).toHaveTextContent("تعارض SoD");
    expect(rows[1]).toHaveTextContent("بانک ملت");
    expect(rows[0]).toHaveTextContent("همه‌ی مشتریان");
    expect(screen.getByText("۸ از ۱۰ کاربر")).toBeInTheDocument();

    const matrix = screen.getByRole("table", { name: /دسترسی هر نقش به هر فعالیت/ });
    const analysis = within(matrix)
      .getByRole("rowheader", { name: /تحلیل و امتیازدهی/ })
      .closest("tr")!;
    expect(within(analysis).getByText("کامل")).toBeInTheDocument();
    expect(within(analysis).getByText("محدود به دامنه")).toBeInTheDocument();

    const conflicts = screen.getByRole("list", { name: "تعارض‌های باز" });
    expect(conflicts).toHaveTextContent("علی رضایی · مالک ریسک + مسئول کنترل");
    expect(within(conflicts).getByRole("link", { name: /تعیین تأییدکننده/ })).toHaveAttribute("href", "/risks/2");

    const card = screen.getByRole("region", { name: "نقش: مالک ریسک" });
    expect(within(card).getByText("واحد خود و زیرواحدها").closest("li")).toHaveAttribute("aria-current", "true");
    expect(within(card).getByText("فقط پیشنهاد به کمیته امنیت")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "گزارش ورود" })).toHaveAttribute("href", "/audit?event=login");
    await expectNoAxeViolations(container);
  });

  it("filters users, pages through them and opens a role from the matrix", async () => {
    const ux = userEvent.setup();
    mockApi({ "GET accounts/roles/": page() });
    render();

    const table = await screen.findByRole("table", { name: "کاربران سامانه" });
    await ux.click(screen.getByRole("button", { name: "صفحه‌ی ۲" }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);

    await ux.type(screen.getByRole("searchbox", { name: "جستجوی نام یا شناسه" }), "سارا");
    expect(within(table).getAllByRole("row")).toHaveLength(2);

    const matrix = screen.getByRole("table", { name: /دسترسی هر نقش به هر فعالیت/ });
    await ux.click(within(matrix).getByRole("button", { name: "کارشناس ریسک" }));
    const card = screen.getByRole("region", { name: "نقش: کارشناس ریسک" });
    expect(within(card).getByRole("link", { name: /ویرایش نقش/ })).toHaveAttribute(
      "href",
      "/admin/auth/group/analyst/change/",
    );

    await ux.click(within(card).getByRole("button", { name: /کاربران این نقش/ }));
    expect(screen.getByRole("combobox", { name: "نقش" })).toHaveValue("analyst");
    expect(within(screen.getByRole("table", { name: "کاربران سامانه" })).getAllByRole("row")).toHaveLength(2);
  });

  it("lists roles in the roles tab", async () => {
    const ux = userEvent.setup();
    mockApi({ "GET accounts/roles/": page() });
    render();
    await ux.click(await screen.findByRole("tab", { name: /نقش‌ها/ }));
    const roles = screen.getByRole("table", { name: "نقش‌های سامانه" });
    expect(roles).toHaveTextContent("از روی سوابق");
    await ux.click(within(roles).getByRole("button", { name: "مالک ریسک" }));
    expect(screen.getByRole("region", { name: "نقش: مالک ریسک" })).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET accounts/roles/": reply(403, { detail: "این صفحه فقط برای مدیر سامانه است." }) });
    render();
    expect(await screen.findByText(/فقط برای مدیر سامانه/)).toBeInTheDocument();
  });
});
