import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ImpactLevels } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { renderPage } from "@/test/render";

import { durationLevel } from "./duration";
import { ImpactLevelsPage } from "./ImpactLevelsPage";

const LEVELS = [
  { id: 1, value: 0, criteria: "هیچ اثر قابل مشاهده‌ای بر ارائه خدمت وجود ندارد.", tags: ["بدون اثر"] },
  { id: 2, value: 1, criteria: "اختلال صرفاً داخلی و غیرحیاتی.", tags: [] },
  { id: 3, value: 2, criteria: "اختلال خدمت حیاتی تا یک‌چهارم RTO.", tags: ["حیاتی · تا یک‌چهارم RTO"] },
  { id: 4, value: 3, criteria: "اختلال خدمت حیاتی بیش از یک‌چهارم RTO و حداکثر RTO.", tags: [] },
  { id: 5, value: 4, criteria: "اختلال خدمت حیاتی بیش از RTO و کمتر از MTPD.", tags: [] },
  { id: 6, value: 5, criteria: "d برابر یا بیشتر از MTPD خدمت حیاتی.", tags: ["علت مشترک در دو بانک"] },
];

function sheet(changes: Partial<ImpactLevels> = {}): ImpactLevels {
  return {
    version: { number: 2, name: "v2", chip: { label: "پیش‌نویس v2", tone: "warning" }, editable: true },
    scale: {
      code: "S",
      name: "خدمت و تداوم",
      title: "ویرایش بُعد پیامد · خدمت و تداوم (S)",
      subtitle: "سطح ۰ تا ۵ · توقف و افت کیفیت",
    },
    tabs: [
      { code: "S", name: "خدمت و تداوم" },
      { code: "F", name: "مالی" },
    ],
    levels: LEVELS,
    base: { name: "v1", levels: LEVELS.map((level) => ({ ...level, criteria: `${level.criteria} (v1)` })) },
    stakeholders: [
      { key: "datin", label: "داتین", note: "پیامد خدمت برای خود سازمان", on: true },
      { key: "customer", label: "هر بانک مشتری مهم", note: "ارزیابی جداگانه برای هر بانک", on: true },
      { key: "aggregate", label: "جمع پیامد چند مشتری", note: "غیرفعال", on: false },
    ],
    stakeholder_note: "داشتن دو مشتری به‌خودی‌خود امتیاز اضافه ندارد.",
    rules: ["در تساوی با MTPD، سطح ۵ مقدم است."],
    history: [
      { version: "v2", title: "بدون تغییر در سطوح S", note: "پیش‌نویس · ۱۴۰۵/۰۸/۲۵", current: true },
      { version: "v1", title: "تعریف نخست سطوح S", note: "فعال · ۱۴۰۵/۰۸/۲۵", current: false },
    ],
    calculator: {
      fraction: 0.25,
      services: [
        { id: 7, label: "پرداخت کارتی · حیاتی", critical: true, rto: 120, mtpd: 480 },
        { id: 8, label: "پورتال گزارش · غیرحیاتی", critical: false, rto: 240, mtpd: 960 },
      ],
    },
    definition: "/method/2",
    ...changes,
  };
}

function render() {
  return renderPage(<ImpactLevelsPage />, { path: "/method/2/impact/S", route: "/method/:number/impact/:code" });
}

describe("durationLevel", () => {
  it("follows the S rule of the method for critical and other services", () => {
    expect(durationLevel(20, 120, 480, true, 0.25)).toBe(2);
    expect(durationLevel(90, 120, 480, true, 0.25)).toBe(3);
    expect(durationLevel(300, 120, 480, true, 0.25)).toBe(4);
    expect(durationLevel(480, 120, 480, true, 0.25)).toBe(5);
    expect(durationLevel(30, 120, 480, false, 0.25)).toBe(1);
    expect(durationLevel(500, 120, 480, false, 0.25)).toBe(3);
    expect(durationLevel(0, 120, 480, true, 0.25)).toBe(0);
  });
});

describe("ImpactLevelsPage", () => {
  it("shows the levels with their tags, rules, stakeholders and history", async () => {
    mockApi({ "GET method/definition/2/impact/S/": sheet() });
    const { container } = render();

    expect(
      await screen.findByRole("heading", { level: 1, name: "ویرایش بُعد پیامد · خدمت و تداوم (S)" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("معیار سطح ۵")).toHaveValue("d برابر یا بیشتر از MTPD خدمت حیاتی.");
    expect(screen.getByText("علت مشترک در دو بانک")).toBeInTheDocument();
    expect(screen.getByText("در تساوی با MTPD، سطح ۵ مقدم است.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "جمع پیامد چند مشتری" })).toBeDisabled();
    expect(screen.getByText("تعریف نخست سطوح S")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "ابعاد پیامد" });
    expect(within(tabs).getByRole("link", { name: /خدمت و تداوم/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /ذخیره در پیش‌نویس v2/ })).toBeDisabled();
    await expectNoAxeViolations(container);
  });

  it("saves the edited criteria and tags into the draft", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET method/definition/2/impact/S/": sheet(),
      "POST method/definition/2/impact/S/": { ...sheet(), saved: 1 },
    });
    render();

    const criteria = await screen.findByLabelText("معیار سطح ۱");
    await user.type(criteria, " بدون تعهد مشتری.");
    await user.click(screen.getByRole("button", { name: "ویرایش برچسب‌های سطح ۱" }));
    await user.type(screen.getByLabelText("برچسب‌های سطح ۱"), "غیرحیاتی ؛ داخلی");
    await user.click(screen.getByRole("button", { name: /ذخیره در پیش‌نویس v2/ }));

    const body = api.callsTo("POST method/definition/2/impact/S/")[0]?.body as {
      levels: { value: number; criteria: string; tags: string[] }[];
    };
    expect(body.levels).toHaveLength(6);
    expect(body.levels[1]).toEqual({
      value: 1,
      criteria: "اختلال صرفاً داخلی و غیرحیاتی. بدون تعهد مشتری.",
      tags: ["غیرحیاتی", "داخلی"],
    });
    expect(await screen.findByText(/سطح در پیش‌نویس v2 ذخیره شد/)).toBeInTheDocument();
  });

  it("restores the levels of the base version", async () => {
    const user = userEvent.setup();
    mockApi({ "GET method/definition/2/impact/S/": sheet() });
    render();

    await user.click(await screen.findByRole("button", { name: "بازگردانی به v1" }));
    expect(screen.getByLabelText("معیار سطح ۰")).toHaveValue("هیچ اثر قابل مشاهده‌ای بر ارائه خدمت وجود ندارد. (v1)");
    expect(screen.getByRole("button", { name: /ذخیره در پیش‌نویس v2/ })).toBeEnabled();
  });

  it("computes the sample S level from the duration", async () => {
    const user = userEvent.setup();
    mockApi({ "GET method/definition/2/impact/S/": sheet() });
    render();

    const result = () => screen.getByText(/نتیجه برای d برابر/);
    expect(await screen.findByText(/نتیجه برای d برابر/)).toHaveTextContent("نتیجه برای d برابر ۹۰ دقیقه: سطح ۳");
    const d = screen.getByLabelText("زمان اختلال d به دقیقه");
    await user.clear(d);
    await user.type(d, "480");
    expect(result()).toHaveTextContent("نتیجه برای d برابر ۸ ساعت: سطح ۵");
    // خدمت غیرحیاتی با RTO ۲۴۰: هشت ساعت از RTO گذشته و سطح ۳ است.
    await user.selectOptions(screen.getByLabelText("خدمت"), "8");
    expect(result()).toHaveTextContent("سطح ۳");
  });

  it("is read-only outside an editable draft", async () => {
    mockApi({
      "GET method/definition/2/impact/S/": sheet({
        version: { number: 2, name: "v2", chip: { label: "فعال v2", tone: "success" }, editable: false },
      }),
    });
    render();

    expect(await screen.findByText("d برابر یا بیشتر از MTPD خدمت حیاتی.")).toBeInTheDocument();
    expect(screen.queryByLabelText("معیار سطح ۵")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ذخیره/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /بازگردانی/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "بازگشت" })).toHaveAttribute("href", "/method/2");
  });

  it("shows an error state", async () => {
    mockApi({ "GET method/definition/2/impact/S/": reply(404, { detail: "پیدا نشد" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });
});
