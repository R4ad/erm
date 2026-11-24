import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { usersRolesPage } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { UsersRolesPage } from "./UsersRolesPage";

function render() {
  return renderPage(<UsersRolesPage />, { path: "/accounts/users", route: "/accounts/users" });
}

describe("UsersRolesPage", () => {
  it("shows users, the access matrix, separation of duties and the selected role", async () => {
    mockApi({ "GET accounts/roles/": usersRolesPage() });
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
    // کاربر جدید در فرم خود سامانه ساخته می‌شود، نه پنل ادمین جنگو که مدیر سامانه‌ی غیر staff را راه نمی‌دهد.
    expect(screen.getByRole("link", { name: "کاربر جدید" })).toHaveAttribute("href", "/accounts/users/new");
    await expectNoAxeViolations(container);
  });

  it("filters users, pages through them and opens a role from the matrix", async () => {
    const ux = userEvent.setup();
    mockApi({ "GET accounts/roles/": usersRolesPage() });
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
    mockApi({ "GET accounts/roles/": usersRolesPage() });
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
