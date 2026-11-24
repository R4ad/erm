import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { methodDefinition } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { MethodDefinitionPage } from "./MethodDefinitionPage";

function render(path = "/method") {
  return renderPage(<MethodDefinitionPage />, { path, route: "/method/:number?" });
}

describe("MethodDefinitionPage", () => {
  it("shows versions, changes, approval flow and every method section", async () => {
    mockApi({ "GET method/definition/": methodDefinition() });
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
      "GET method/definition/": methodDefinition(),
      "POST method/definition/2/parameters/": { changed: ["horizon"], page: methodDefinition() },
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
    const submitted = methodDefinition({
      version: { ...methodDefinition().version, submitted: true, editable: false },
      can_submit: false,
    });
    const api = mockApi({
      "GET method/definition/": methodDefinition(),
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
      "GET method/definition/": methodDefinition({
        version: {
          ...methodDefinition().version,
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
