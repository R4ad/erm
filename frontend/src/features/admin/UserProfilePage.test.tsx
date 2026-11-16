import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { UserProfile } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { UserProfilePage } from "./UserProfilePage";

const LEVELS = [
  { rank: 1, name: "پایین", color: "#198754", text_color: "#fff", delegable: true },
  { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000", delegable: true },
  { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000", delegable: false },
  { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff", delegable: false },
];

function profile(changes: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 5,
    name: "مهدی فرهادی",
    initials: "م ف",
    username: "m.farhadi",
    status: { value: "active", label: "فعال", tone: "success" },
    source: { value: "ad", label: "همگام با AD" },
    subtitle: "معاونت امنیت و تداوم · نام کاربری m.farhadi · مدیر مستقیم: سعید مرادی",
    identity: {
      locked: true,
      fields: [
        { key: "name", label: "نام و نام خانوادگی", value: "مهدی فرهادی" },
        { key: "username", label: "نام کاربری", value: "m.farhadi", code: true },
        { key: "synced", label: "آخرین همگام‌سازی", value: "امروز ۰۸:۳۰" },
      ],
      edit_url: "/admin/accounts/user/5/change/",
    },
    roles: [
      {
        key: "workgroup",
        label: "کارگروه ریسک",
        tone: "info",
        description: "اختلاف ارزیابی را بررسی می‌کند.",
        scope: "همه‌ی واحدها",
        origin: "تخصیص در ERM",
        since: "۱۴۰۴/۰۱/۱۵",
        removable: true,
      },
      {
        key: "owner",
        label: "مالک ریسک",
        tone: "warning",
        description: "تصمیم مواجهه و پذیرش در حدود اختیار",
        scope: "معاونت امنیت و تداوم · ۵ ریسک",
        origin: "از روی سوابق",
        since: "۱۴۰۴/۰۳/۱۰",
        removable: false,
      },
    ],
    available_roles: [{ key: "viewer", label: "بازدیدکننده" }],
    sod: {
      chip: { label: "بدون تعارض فعال", tone: "success" },
      checks: [
        { text: "تأییدکننده‌ی نتیجه‌ی اقدام‌های ریسک‌های خودش نیست", tone: "success" },
        { text: "عضو کارگروه و مالک هم‌زمان: در بررسی اختلاف امتیاز ریسک‌های خود کنار گذاشته شود", tone: "warning" },
      ],
    },
    delegation: null,
    levels: LEVELS,
    successors: [
      { id: 7, name: "علی رضایی", unit: "امنیت" },
      { id: 8, name: "نرگس امینی", unit: "ریسک" },
    ],
    escalation: "سعید مرادی",
    duties: {
      tiles: [
        { key: "risks", label: "ریسک مالک", value: 5 },
        { key: "actions", label: "اقدام باز", value: 3 },
        { key: "acceptances", label: "پذیرش فعال", value: 1 },
        { key: "approvals", label: "تأیید در انتظار", value: 2 },
      ],
      risks: [
        {
          id: 51,
          code: "RK-1405-0051",
          title: "نفوذ از طریق حساب دسترسی ممتاز ساتنا",
          href: "/risks/51/",
          score: 20,
          level: { rank: 4, name: "بحرانی", color: "#dc3545", text_color: "#fff" },
        },
      ],
      more: 4,
    },
    activity: [
      { key: "0", icon: "flow", tone: "info", title: "انتقال پرونده‌ی RK-1405-0051 به کمیته", note: "امروز ۰۹:۱۲" },
      { key: "1", icon: "lock", tone: "danger", title: "ورود ناموفق", note: "۱۴۰۵/۰۸/۱۹" },
    ],
    can_deactivate: true,
    open_duties: "مالک ۵ ریسک و ۳ اقدام باز",
    users_page: "/accounts/users",
    ...changes,
  };
}

const DELEGATION: NonNullable<UserProfile["delegation"]> = {
  id: 3,
  chip: { label: "زمان‌بندی‌شده · ۴ روز دیگر", tone: "info" },
  successor: { id: 7, name: "علی رضایی · کارشناس ارشد امنیت" },
  created: "مهدی فرهادی · ۱۴۰۵/۰۸/۲۵",
  period: "۱۴۰۵/۰۹/۰۱ تا ۱۴۰۵/۰۹/۱۵",
  starts_on: "1405/09/01",
  ends_on: "1405/09/15",
  scope: "تصمیم مواجهه و پذیرش تا سطح متوسط",
  escalation: "سعید مرادی",
  max_rank: 2,
  notify_successor: true,
  copy_owner: true,
};

function render() {
  return renderPage(<UserProfilePage />, { path: "/accounts/users/5", route: "/accounts/users/:id" });
}

describe("UserProfilePage", () => {
  it("shows identity, roles, separation of duties and responsibilities", async () => {
    mockApi({ "GET accounts/users/5/": profile({ delegation: DELEGATION }) });
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: "مهدی فرهادی" })).toBeInTheDocument();
    expect(screen.getByText("فقط خواندنی")).toBeInTheDocument();
    expect(screen.getByLabelText("نام کاربری")).toHaveValue("m.farhadi");
    const roles = screen.getByRole("table", { name: /نقش‌ها و دامنه/ });
    expect(within(roles).getByText("معاونت امنیت و تداوم · ۵ ریسک")).toBeInTheDocument();
    expect(within(roles).getAllByRole("button", { name: /عمل‌های نقش/ })).toHaveLength(1);
    expect(screen.getByText("بدون تعارض فعال")).toBeInTheDocument();
    expect(screen.getByText("زمان‌بندی‌شده · ۴ روز دیگر")).toBeInTheDocument();
    expect(screen.getByText("تصمیم مواجهه و پذیرش تا سطح متوسط")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "نفوذ از طریق حساب دسترسی ممتاز ساتنا" })).toBeInTheDocument();
    expect(screen.getByText("و ۴ ریسک دیگر")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ذخیره‌ی تغییرات/ })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it("stages role changes until they are saved", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET accounts/users/5/": profile(),
      "POST accounts/users/5/": { ...profile(), message: "تغییرات ذخیره شد" },
    });
    render();

    await user.click(await screen.findByRole("button", { name: "عمل‌های نقش کارگروه ریسک" }));
    await user.click(await screen.findByRole("menuitem", { name: "برداشتن نقش" }));
    await user.click(screen.getByRole("button", { name: /افزودن نقش/ }));
    await user.click(await screen.findByRole("menuitem", { name: "بازدیدکننده" }));
    expect(screen.getByRole("table", { name: /نقش‌ها و دامنه/ })).toHaveTextContent("پس از ذخیره افزوده می‌شود");
    await user.click(screen.getByRole("button", { name: /ذخیره‌ی تغییرات/ }));
    expect(api.callsTo("POST accounts/users/5/")[0]?.body).toEqual({ action: "save", roles: ["viewer"] });
    expect(await screen.findByText("تغییرات ذخیره شد")).toBeInTheDocument();
  });

  it("schedules a delegation up to a delegable level", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET accounts/users/5/": profile(),
      "POST accounts/users/5/": { ...profile({ delegation: DELEGATION }), message: "تغییرات ذخیره شد" },
    });
    render();

    await user.click(await screen.findByRole("button", { name: /ثبت تفویض/ }));
    await user.selectOptions(screen.getByLabelText("جانشین"), "7");
    await user.type(screen.getByLabelText("از تاریخ"), "1405/09/01");
    await user.type(screen.getByLabelText("تا تاریخ"), "1405/09/15");
    expect(screen.queryByRole("button", { name: "تفویض تا سطح بالا" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تفویض تا سطح متوسط" }));
    await user.click(screen.getByLabelText("رونوشت تصمیم‌های جانشین برای مالک"));
    await user.click(screen.getByRole("button", { name: /ذخیره‌ی تغییرات/ }));

    expect(api.callsTo("POST accounts/users/5/")[0]?.body).toEqual({
      action: "save",
      delegation: {
        successor: 7,
        starts_on: "1405/09/01",
        ends_on: "1405/09/15",
        max_rank: 2,
        notify_successor: true,
        copy_owner: false,
      },
    });
    expect(await screen.findByText("زمان‌بندی‌شده · ۴ روز دیگر")).toBeInTheDocument();
  });

  it("cancels a delegation and deactivates the user after confirmation", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET accounts/users/5/": profile({ delegation: DELEGATION }),
      "POST accounts/users/5/": { ...profile(), message: "تفویض لغو شد" },
    });
    render();

    await user.click(await screen.findByRole("button", { name: "لغو تفویض" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "لغو تفویض" }));
    expect(api.callsTo("POST accounts/users/5/")[0]?.body).toEqual({ action: "cancel_delegation" });

    await user.click(await screen.findByRole("button", { name: "غیرفعال‌سازی" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("مالک ۵ ریسک و ۳ اقدام باز");
    await user.click(within(dialog).getByRole("button", { name: "غیرفعال‌سازی" }));
    expect(api.callsTo("POST accounts/users/5/")[1]?.body).toEqual({ action: "deactivate" });
  });

  it("shows an error state", async () => {
    mockApi({ "GET accounts/users/5/": reply(403, { detail: "پروفایل کاربران را مدیر سامانه می‌بیند." }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
