import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { leaveTo } from "@/lib/navigation";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { myWork, riskDetail, riskFilters, riskPage, session } from "@/test/fixtures";

import { Providers } from "./providers";
import { createQueryClient } from "./query-client";
import { routes } from "./routes";

// همه‌ی برنامه با مسیرهای واقعی (پوسته، بخش‌های کد جدای هر صفحه) و API آزمون.
function renderApp(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <Providers client={createQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, user };
}

function api(extra = {}) {
  return mockApi({
    "GET session/": session(),
    "GET my-work/": myWork(),
    "GET risks/": riskPage(),
    "GET risks/filters/": riskFilters(),
    "GET risks/1/": riskDetail(),
    ...extra,
  });
}

describe("app shell", () => {
  it("shows the user's menu, marks the current page and links classic pages", async () => {
    api();
    renderApp();
    expect(await screen.findByRole("heading", { name: "کارهای من", level: 1 })).toBeInTheDocument();
    const [nav] = screen.getAllByRole("navigation", { name: "منوی اصلی" });
    expect(within(nav!).getByRole("link", { name: "کارهای من" })).toHaveAttribute("aria-current", "page");
    const classic = within(nav!).getByRole("link", { name: /شواهد/ });
    expect(classic).toHaveAttribute("href", "/risks/evidence/");
    expect(classic).toHaveAccessibleName(/در صفحه‌های فعلی سامانه باز می‌شود/);
    expect(screen.getByRole("link", { name: "رفتن به محتوای صفحه" })).toHaveAttribute("href", "#main");
    await expectNoAxeViolations();
  });

  it("derives the summary from real work items", async () => {
    api();
    renderApp();
    const stat = async (label: string) => (await screen.findByText(label)).nextElementSibling?.textContent;
    expect(await stat("کارهای باز")).toBe("۳");
    expect(await stat("مهلت گذشته")).toBe("۱");
    expect(await stat("مهلت تا ۷ روز دیگر")).toBe("۲");
    expect(screen.getByRole("region", { name: /اقدام‌های من/ })).toBeInTheDocument();
    const questions = screen.getByRole("region", { name: /پرسش‌های ریسک منتظر جواب/ });
    // موردی که صفحه‌ی React دارد درون برنامه باز می‌شود؛ بقیه در صفحه‌های فعلی.
    expect(within(questions).getByRole("link", { name: "پرسش آزمون درباره‌ی پایش" })).toHaveAttribute(
      "href",
      "/questionnaires/risk-questions",
    );
    expect(screen.getByRole("link", { name: /اقدام آزمون عقب‌افتاده/ })).toHaveAttribute("href", "/actions/2/");
  });

  it("jumps to register search with the / key", async () => {
    api();
    const { router, user } = renderApp();
    await screen.findByRole("heading", { name: "کارهای من", level: 1 });
    await user.keyboard("/");
    const search = screen.getByRole("searchbox", { name: "جست‌وجوی ریسک" });
    expect(search).toHaveFocus();
    await user.type(search, "درگاه{Enter}");
    await waitFor(() => expect(router.state.location.search).toBe("?q=%D8%AF%D8%B1%DA%AF%D8%A7%D9%87"));
    expect(await screen.findByRole("heading", { name: "رجیستر ریسک", level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("opens the mobile menu as a dialog and returns focus when it closes", async () => {
    api();
    const { user } = renderApp();
    const button = await screen.findByRole("button", { name: "منو" });
    await user.click(button);
    const drawer = await screen.findByRole("dialog", { name: "منوی اصلی" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(drawer).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());

    await user.click(button);
    await user.click(within(await screen.findByRole("dialog")).getByRole("link", { name: "رجیستر ریسک" }));
    expect(await screen.findByRole("heading", { name: "رجیستر ریسک", level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // بعد از رفتن به صفحه‌ی تازه، فوکوس روی محتواست، نه روی دکمه‌ی منو.
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("logs out through the API and leaves for the login page", async () => {
    const calls = api({ "POST auth/logout/": { login_url: "/app/login/" } });
    const { user } = renderApp();
    await user.click(await screen.findByRole("button", { name: "حساب کاربری: کاربر آزمون" }));
    await user.click(await screen.findByRole("menuitem", { name: "خروج" }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/app/login/"));
    expect(calls.callsTo("POST auth/logout/")).toHaveLength(1);
  });

  it("sends an expired session to login with the way back", async () => {
    mockApi({ "GET session/": reply(403, { detail: "وارد نشده‌اید.", login_url: "/app/login/" }) });
    window.history.replaceState(null, "", "/app/risks/1?tab=workflow");
    renderApp("/risks/1?tab=workflow");
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/app/login/?next=%2Fapp%2Frisks%2F1%3Ftab%3Dworkflow"));
  });

  it("shows a not-found page inside the shell", async () => {
    api();
    renderApp("/no-such-page");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/پیدا نشد|نیست/);
    expect(screen.getAllByRole("navigation", { name: "منوی اصلی" }).length).toBeGreaterThan(0);
  });
});

describe("risk dossier", () => {
  it("keeps the open tab in the URL", async () => {
    api();
    const { router, user } = renderApp("/risks/1?tab=assessments");
    const tabs = await screen.findByRole("tablist", { name: "بخش‌های پرونده" });
    expect(within(tabs).getByRole("tab", { name: /ارزیابی‌ها/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("AS-1405-0001");

    await user.click(within(tabs).getByRole("tab", { name: /گردش کار/ }));
    expect(router.state.location.search).toBe("?tab=workflow");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("دلیل آزمونی انتقال");

    await user.click(within(tabs).getByRole("tab", { name: "شرح" }));
    expect(router.state.location.search).toBe("");
    await expectNoAxeViolations();
  });

  it("opens outside links in a new tab without the opener, and never as script", async () => {
    const risk = riskDetail();
    risk.links.push({ kind: "تیکت", ref: "BAD-1", url: "javascript:alert(1)" });
    api({ "GET risks/1/": risk });
    renderApp("/risks/1");
    const external = await screen.findByRole("link", { name: /TEST-1/ });
    expect(external).toHaveAttribute("href", "https://tickets.example.test/TEST-1");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("BAD-1").closest("a")).toBeNull();
  });
});
