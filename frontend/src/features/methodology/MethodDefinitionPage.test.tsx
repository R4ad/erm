import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";
import type { MethodDefinition, MethodParam } from "@/lib/types";

import { MethodDefinitionPage } from "./MethodDefinitionPage";

function param(key: string, label: string, group: string, value: string, unit: string, before: string | null = null) {
  return { key, label, group, value, unit, text: `${value} ${unit}`, note: "بخش ۱۴ سند v5", before } as MethodParam;
}

function page(changes: Partial<MethodDefinition> = {}): MethodDefinition {
  const level = (rank: number, name: string, min: number, max: number) => ({
    rank,
    name,
    min,
    max,
    color: "#000",
    text_color: "#fff",
  });
  return {
    version: {
      number: 2,
      name: "v2",
      title: "روش v5 · بازنگری",
      status: { value: "draft", label: "پیش‌نویس" },
      is_trial: false,
      based_on: "v1",
      saved: { iso: "2026-11-16", jalali: "1405/08/25" },
      submitted: false,
      editable: true,
      reference: "/method/2/reference/",
      change_notes: "",
    },
    can_submit: true,
    can_copy: false,
    copy_from: "v1",
    versions: [
      {
        number: 2,
        name: "v2",
        title: "بازنگری",
        status: { value: "draft", label: "پیش‌نویس" },
        date: { iso: "2026-11-16", jalali: "1405/08/25" },
        note: "۲ تغییر · در دست ویرایش",
        current: true,
      },
      {
        number: 1,
        name: "v1",
        title: "روش v5",
        status: { value: "active", label: "فعال" },
        date: { iso: "2026-05-05", jalali: "1405/02/15" },
        note: "تصویب ۱۲/۴ · ۴۲ ارزیابی جاری به این نسخه پیوند دارند",
        current: false,
      },
    ],
    changes: [
      {
        key: "param:a_data_coverage",
        group: "base",
        label: "کمترین پوشش ثبت دامنه‌ی آغازگر",
        before: "۹۰ درصد",
        after: "۹۵ درصد",
      },
      {
        key: "level:1:review",
        group: "appetite",
        label: "بازبینی دوره‌ای سطح پایین",
        before: "سالانه",
        after: "شش‌ماهه",
      },
    ],
    groups: [
      { key: "base", label: "پارامترهای پایه", changes: 1 },
      { key: "likelihood", label: "احتمال", changes: 0 },
      { key: "impact", label: "پیامد", changes: 0 },
      { key: "levels", label: "سطح و تصمیم", changes: 0 },
      { key: "appetite", label: "اشتها و پذیرش", changes: 1 },
      { key: "monitoring", label: "پایش", changes: 0 },
    ],
    approval: [
      { key: "draft", title: "پیش‌نویس", note: "متولی روش · ۱۴۰۵/۰۸/۲۰", state: "current" },
      { key: "review", title: "بازبینی روش‌شناختی امنیت", note: "کارشناس ریسک", state: "locked" },
      { key: "approval", title: "تصویب مرجع مجاز", note: "کمیته امنیت", state: "locked" },
      { key: "publish", title: "انتشار", note: "فقط ارزیابی‌های جدید یا بازسنجی‌شده", state: "locked" },
    ],
    categories: [
      { code: "T1", name: "امنیت اطلاعات و سایبری", risks: 14 },
      { code: "T2", name: "نرم‌افزار و توسعه", risks: 9 },
    ],
    parameters: [
      param("horizon", "افق پیش‌فرض ارزیابی", "base", "12", "ماه"),
      param("input_return", "مهلت پیشنهادی جواب ورودی مبهم", "base", "5", "روز کاری"),
      param("a_data_period", "کمترین دوره‌ی داده برای نرخ A", "base", "12", "ماه"),
      param("a_data_coverage", "کمترین پوشش ثبت دامنه‌ی آغازگر", "base", "95", "درصد", "۹۰ درصد"),
      param("reminder_first", "یادآوری اول پیش از انقضای پذیرش", "appetite", "30", "روز تقویمی"),
      param("control_sample", "اندازه‌ی نمونه‌ی آزمون کنترل", "monitoring", "30", "نمونه"),
    ],
    likelihood: {
      rows: [1, 2, 3, 4, 5].map((a) => ({
        a,
        cells: [1, 2, 3, 4, 5].map((b) => ({ b, l: Math.min(5, Math.ceil((a + b) / 2)), changed: false })),
      })),
      names: [
        { value: 1, name: "بسیار کم" },
        { value: 5, name: "بسیار زیاد" },
      ],
      source: "NIST SP 800-30",
      changed: 0,
    },
    levels: {
      levels: [level(1, "پایین", 1, 4), level(2, "متوسط", 5, 9), level(3, "بالا", 10, 15), level(4, "بحرانی", 16, 25)],
      rules: [
        { key: "floor-5", title: "کف پیامد ۵ ← حداقل «بالا»", note: "عدد خام تغییر نمی‌کند", source: "version" },
        { key: "incident", title: "رویداد در حال وقوع ← اولویت بحرانی", note: "ارجاع به رخداد", source: "system" },
      ],
    },
    appetite: [
      {
        rank: 1,
        level: { name: "پایین", color: "#198754", rank: 1 },
        authority: "مالک ریسک",
        plan: "۳۰ روز تقویمی",
        acceptance: "۱۲ ماه",
        review: "شش‌ماهه",
        reminder: "۳۰ و ۷ روز",
        changed: ["review"],
      },
    ],
    impact_scales: [
      { code: "S", name: "خدمت و تداوم", scope: "توقف و زمان بازیابی", stakeholders: ["داتین", "مشتری"], levels: 6 },
      { code: "F", name: "مالی", scope: "هزینه‌ی بازیابی", stakeholders: ["داتین"], levels: 6 },
    ],
    admin_url: null,
    ...changes,
  };
}

function render(path = "/method") {
  return renderPage(<MethodDefinitionPage />, { path, route: "/method/:number?" });
}

describe("MethodDefinitionPage", () => {
  it("shows versions, changes, approval flow and every method section", async () => {
    mockApi({ "GET method/definition/": page() });
    const { container } = render();

    const changes = await screen.findByRole("region", { name: "تغییرات v2 نسبت به v1" });
    expect(within(changes).getByText("کمترین پوشش ثبت دامنه‌ی آغازگر")).toBeInTheDocument();
    expect(within(changes).getByText("۹۵ درصد")).toBeInTheDocument();
    const versions = screen.getByRole("region", { name: "نسخه‌ها" });
    expect(within(versions).getByRole("link", { current: "page" })).toHaveAttribute("href", "/method/2");
    const approval = screen.getByRole("region", { name: "گردش تصویب" });
    expect(within(approval).getByText("مرحله‌ی جاری")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "L برای هر ترکیب A و B" })).toBeInTheDocument();
    const appetite = screen.getByRole("table", { name: "قواعد هر سطح ریسک" });
    expect(within(appetite).getByText(/تغییر نسبت به v1/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "کف پیامد ۵ ← حداقل «بالا»" })).toBeChecked();
    expect(screen.getByRole("table", { name: "ابعاد پیامد این نسخه" })).toHaveTextContent("داتین · مشتری");
    expect(screen.getByRole("region", { name: "طبقه‌بندی ریسک" })).toHaveTextContent("امنیت اطلاعات و سایبری");
    expect(screen.getByRole("navigation", { name: "بخش‌های روش" })).toHaveTextContent("طبقه‌بندی۲");
    await expectNoAxeViolations(container);
  });

  it("saves edited draft parameters", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET method/definition/": page(),
      "POST method/definition/2/parameters/": { changed: ["horizon"], page: page() },
    });
    render();

    const horizon = await screen.findByRole("textbox", { name: /افق ارزیابی پیش‌فرض/ });
    await user.clear(horizon);
    await user.type(horizon, "۱۸");
    const bar = screen.getByRole("region", { name: "تغییرهای ذخیره‌نشده" });
    expect(bar).toHaveTextContent("۱ مقدار تغییر کرده");
    expect(screen.getByRole("button", { name: "ارسال برای تصویب" })).toBeDisabled();
    await user.click(within(bar).getByRole("button", { name: "ذخیره‌ی تغییرات" }));
    await waitFor(() =>
      expect(api.callsTo("POST method/definition/2/parameters/")[0]?.body).toEqual({ values: { horizon: "18" } }),
    );
    await waitFor(() => expect(screen.queryByRole("region", { name: "تغییرهای ذخیره‌نشده" })).not.toBeInTheDocument());
  });

  it("submits the draft with change notes", async () => {
    const user = userEvent.setup();
    const submitted = page({
      version: { ...page().version, submitted: true, editable: false },
      can_submit: false,
    });
    const api = mockApi({
      "GET method/definition/": page(),
      "POST method/definition/2/submit/": submitted,
    });
    render();

    await user.click(await screen.findByRole("button", { name: "ارسال برای تصویب" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "ارسال برای تصویب" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: /شرح تغییرات نسبت به v1/ }), "پوشش ۹۵٪");
    await user.click(confirm);
    await waitFor(() =>
      expect(api.callsTo("POST method/definition/2/submit/")[0]?.body).toEqual({ change_notes: "پوشش ۹۵٪" }),
    );
    expect(await screen.findByText(/برای بازبینی روش‌شناختی و تصویب فرستاده شده است/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /افق ارزیابی پیش‌فرض/ })).toHaveAttribute("readonly");
  });

  it("offers a new draft when none is open, and shows errors", async () => {
    mockApi({
      "GET method/definition/": page({
        version: {
          ...page().version,
          number: 1,
          name: "v1",
          status: { value: "active", label: "فعال" },
          editable: false,
        },
        can_submit: false,
        can_copy: true,
        changes: [],
      }),
    });
    render("/method/1");
    expect(await screen.findByRole("button", { name: "ایجاد پیش‌نویس از v1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ارسال برای تصویب" })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET method/definition/": reply(500, { detail: "خطا" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
