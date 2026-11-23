import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AdSync } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { AdSyncPage } from "./AdSyncPage";

type Row = AdSync["changes"][number];

function change(username: string, kind: Row["kind"], extra: Partial<Row> = {}): Row {
  const labels = { new: "جدید", moved: "جابه‌جایی", disabled: "غیرفعال" } as const;
  const tones = { new: "info", moved: "warning", disabled: "danger" } as const;
  return {
    key: `${kind}-${username}`,
    kind,
    label: labels[kind],
    tone: tones[kind],
    user: { id: 10, name: `کاربر ${username}`, username },
    unit: "زیرساخت",
    impact: { text: "بدون مسئولیت باز", tone: "neutral" },
    action: { kind: "none", label: "ایجاد کاربر", href: null },
    apply: true,
    attention: false,
    inactive: false,
    ...extra,
  };
}

function sheet(changes: Partial<AdSync> = {}): AdSync {
  return {
    title: "همگام‌سازی با Active Directory",
    subtitle: "واحدها و کاربران از AD خوانده می‌شوند · پیش‌نمایش امروز ساعت ۰۸:۳۰ آماده شد",
    pending: 6,
    applicable: 5,
    connection: {
      server: "ldaps://dc01.datin.local:636",
      base_dn: "OU=Datin,DC=datin,DC=local",
      service_account: "svc-erm-sync · فقط خواندنی",
      schedule: "روزانه ساعت ۰۸:۳۰",
      state: { label: "متصل", tone: "success" },
      note: "",
      tested: "امروز ۰۸:۰۰",
    },
    tiles: [
      { key: "new", label: "کاربر جدید", value: 3, note: "در AD ایجاد شده‌اند" },
      { key: "moved", label: "جابه‌جایی واحد", value: 1, note: "۱ مورد مسئولیت باز دارد" },
      { key: "disabled", label: "غیرفعال در AD", value: 1, note: "۱ مورد نیازمند جانشین" },
      { key: "unmapped", label: "شاخه‌ی نگاشت‌نشده", value: 1, note: "۵ کاربر بدون تغییر" },
    ],
    branches: [
      {
        key: "ou=infra",
        ou: "OU=Infra",
        users: 3,
        state: "mapped",
        status: { label: "نگاشت‌شده", tone: "success" },
        unit: "زیرساخت",
      },
      {
        key: "ou=dataplatform",
        ou: "OU=DataPlatform",
        users: 2,
        state: "unmapped",
        status: { label: "نیازمند نگاشت", tone: "warning" },
        unit: null,
      },
    ],
    unit_options: [{ id: 9, name: "تدارکات" }],
    changes: [
      change("b.fathi", "disabled", {
        user: { id: 21, name: "بهرام فتحی", username: "b.fathi" },
        impact: { text: "مالک RK-1405-0019 و ۱ اقدام باز؛ جانشین لازم است", tone: "danger" },
        action: { kind: "successor", label: "تعیین جانشین", href: null },
        attention: true,
      }),
      change("a.hosseini", "moved", {
        impact: { text: "مجری ۲ اقدام باز؛ نقش‌ها حفظ می‌شوند و تأیید مدیر جدید لازم است", tone: "warning" },
        action: { kind: "review", label: "بررسی", href: "/accounts/users" },
      }),
      change("s.karimi", "new"),
      change("p.naderi", "new"),
      change("m.rahmani", "new"),
    ],
    unchanged: 5,
    rules: [
      { key: "auto_create", label: "ایجاد خودکار کاربر جدید", note: "بدون نقش", on: true, locked: false },
      { key: "roles", label: "اعطا یا حذف نقش از گروه‌های AD", note: "همیشه غیرفعال", on: false, locked: true },
    ],
    rules_note: "نقش‌های ERM هرگز از AD اعطا یا حذف نمی‌شوند.",
    history: [
      { id: 2, title: "امروز ۰۸:۳۰ · پیش‌نمایش", note: "۶ تغییر در انتظار اعمال", status: "preview", tone: "warning" },
      { id: 1, title: "۱۴۰۵/۰۸/۲۴ · ناموفق", note: "خطای گواهی LDAPS · رفع شد", status: "failed", tone: "danger" },
    ],
    successors: [
      { id: 21, name: "بهرام فتحی", unit: "زیرساخت" },
      { id: 30, name: "نرگس امینی", unit: "زیرساخت" },
    ],
    org_chart: "/units",
    ...changes,
  };
}

function render() {
  return renderPage(<AdSyncPage />, { path: "/units/ad-sync", route: "/units/ad-sync" });
}

describe("AdSyncPage", () => {
  it("shows the connection, the changes and their effect on open duties", async () => {
    mockApi({ "GET org/ad-sync/": sheet() });
    const { container } = render();

    expect(
      await screen.findByRole("heading", { level: 1, name: "همگام‌سازی با Active Directory" }),
    ).toBeInTheDocument();
    expect(screen.getByText("۶ مورد در انتظار")).toBeInTheDocument();
    expect(screen.getByText("ldaps://dc01.datin.local:636")).toBeInTheDocument();
    const changes = screen.getByRole("table", { name: "پیش‌نمایش تغییر کاربران" });
    expect(within(changes).getByText("مالک RK-1405-0019 و ۱ اقدام باز؛ جانشین لازم است")).toBeInTheDocument();
    expect(within(changes).getByRole("link", { name: "بررسی" })).toHaveAttribute("href", "/accounts/users");
    // دو کاربر جدید نشان داده می‌شود و بقیه پشت یک پیوند می‌مانند.
    expect(within(changes).queryByText("m.rahmani")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /اعطا یا حذف نقش/ })).toBeDisabled();
    expect(screen.getByText("خطای گواهی LDAPS · رفع شد")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("filters to the changes with an effect and expands the new users", async () => {
    const user = userEvent.setup();
    mockApi({ "GET org/ad-sync/": sheet() });
    render();

    const changes = await screen.findByRole("table", { name: "پیش‌نمایش تغییر کاربران" });
    await user.click(screen.getByRole("button", { name: "و ۱ کاربر جدید دیگر" }));
    expect(within(changes).getByText("m.rahmani")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /فقط موارد دارای اثر/ }));
    expect(within(changes).getAllByRole("row")).toHaveLength(3);
    expect(within(changes).queryByText("s.karimi")).not.toBeInTheDocument();
  });

  it("applies the changes after confirmation", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET org/ad-sync/": sheet(),
      "POST org/ad-sync/": { ...sheet({ changes: [], applicable: 0, pending: 1 }), message: "۵ تغییر اعمال شد" },
    });
    render();

    await user.click(await screen.findByRole("button", { name: "اعمال ۵ تغییر" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "اعمال ۵ تغییر" }));
    expect(api.callsTo("POST org/ad-sync/")[0]?.body).toEqual({ action: "apply" });
    expect(await screen.findByText("۵ تغییر اعمال شد")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اعمال ۰ تغییر" })).toBeDisabled();
  });

  it("hands the open duties of a leaving user to a successor", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET org/ad-sync/": sheet(),
      "POST org/ad-sync/": { ...sheet(), message: "۲ مسئولیت به نرگس امینی منتقل شد" },
    });
    render();

    await user.click(await screen.findByRole("button", { name: "تعیین جانشین" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "انتقال مسئولیت‌ها" });
    expect(confirm).toBeDisabled();
    const select = within(dialog).getByLabelText("جانشین");
    expect(within(select).queryByRole("option", { name: /بهرام فتحی/ })).not.toBeInTheDocument();
    await user.selectOptions(select, "30");
    await user.click(confirm);
    expect(api.callsTo("POST org/ad-sync/")[0]?.body).toEqual({ action: "successor", user: 21, successor: 30 });
    expect(await screen.findByText("۲ مسئولیت به نرگس امینی منتقل شد")).toBeInTheDocument();
  });

  it("maps a branch, toggles a rule and reruns the preview", async () => {
    const user = userEvent.setup();
    const api = mockApi({ "GET org/ad-sync/": sheet(), "POST org/ad-sync/": { ...sheet(), message: null } });
    render();

    await user.selectOptions(await screen.findByLabelText("واحد شاخه‌ی OU=DataPlatform"), "9");
    await user.click(screen.getByRole("switch", { name: /ایجاد خودکار کاربر جدید/ }));
    await user.click(screen.getByRole("button", { name: /پیش‌نمایش دوباره/ }));
    await user.click(screen.getByRole("button", { name: /آزمون اتصال/ }));
    expect(api.callsTo("POST org/ad-sync/").map((call) => call.body)).toEqual([
      { action: "map", ou: "ou=dataplatform", unit: "9" },
      { action: "rules", key: "auto_create", on: false },
      { action: "preview" },
      { action: "test" },
    ]);
  });

  it("shows an error state", async () => {
    mockApi({ "GET org/ad-sync/": reply(403, { detail: "همگام‌سازی AD کار مدیر سامانه است." }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
