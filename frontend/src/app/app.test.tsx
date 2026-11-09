import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { leaveTo } from "@/lib/navigation";
import { mockApi, reply, type ApiCall } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  assessmentDetail,
  compareAssessments,
  myWork,
  riskDetail,
  riskFilters,
  riskForm,
  riskPage,
  routeTable,
  session,
} from "@/test/fixtures";

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

describe("route table", () => {
  it("has a page for every Django page the server says this app shows", () => {
    for (const entry of routeTable) {
      const sample = entry.route.replace(/:(\w+)/g, "1");
      const leaf = matchRoutes(routes, sample)?.at(-1)?.route;
      expect(leaf?.path, `${entry.name} → ${sample}`).not.toBe("*");
      expect(leaf, `${entry.name} → ${sample}`).toBeDefined();
    }
  });
});

describe("app shell", () => {
  it("shows the user's menu, marks the current page and links classic pages", async () => {
    api();
    renderApp();
    expect(await screen.findByRole("heading", { name: "کارهای من", level: 1 })).toBeInTheDocument();
    const [nav] = screen.getAllByRole("navigation", { name: "منوی اصلی" });
    expect(within(nav!).getByRole("link", { name: "کارهای من" })).toHaveAttribute("aria-current", "page");
    // صفحه‌ای که در رابط تازه هست با مسیر خود رابط باز می‌شود و بقیه هنوز با صفحه‌ی کلاسیک جنگو.
    expect(within(nav!).getByRole("link", { name: "شواهد" })).toHaveAttribute("href", "/risks/evidence");
    const classic = within(nav!).getByRole("link", { name: /خدمات/ });
    expect(classic).toHaveAttribute("href", "/catalog/services/");
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
    risk.links.push({ kind: "تیکت", ref: "BAD-1", url: "javascript:alert(1)", edit_url: null });
    api({ "GET risks/1/": risk });
    renderApp("/risks/1");
    const external = await screen.findByRole("link", { name: /^TEST-1/ });
    expect(external).toHaveAttribute("href", "https://tickets.example.test/TEST-1");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("BAD-1").closest("a")).toBeNull();
  });

  it("offers what Django allows on the risk as in-app pages, and comes back after saving", async () => {
    const calls = api({
      "GET forms/": riskForm(),
      "POST forms/": { message: "ریسک ذخیره شد.", redirect: { href: "/risks/1/", route: "/risks/1" } },
    });
    const { router, user } = renderApp("/risks/1");
    const transition = await screen.findByRole("link", { name: "شروع اجرا" });
    expect(transition).toHaveAttribute("href", "/workflow/risks/1/transition/start_treatment");
    expect(screen.getByRole("link", { name: "RK-1405-0009" })).toHaveAttribute("href", "/risks/9");

    await user.click(screen.getByRole("button", { name: /کارهای دیگر/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "پیشنهاد ادغام" })).toHaveAttribute(
      "href",
      "/workflow/risks/1/requests/merge",
    );
    expect(within(menu).getByRole("menuitem", { name: "شاهد تازه" })).toHaveAttribute(
      "href",
      "/risks/evidence/new?risk=1",
    );
    // کاری که جنگو اجازه نمی‌دهد اصلاً پیشنهاد نمی‌شود (و خود جنگو هم دوباره چک می‌کند).
    expect(within(menu).queryByRole("menuitem", { name: "ارزیابی تازه" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "ویرایش ریسک" }));

    expect(await screen.findByRole("heading", { name: "ویرایش ریسک", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/risks/1/edit");
    expect(calls.callsTo("GET forms/")[0]!.query.get("path")).toBe("/risks/1/edit/");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/risks/1"));
    expect(await screen.findByText("ریسک ذخیره شد.")).toBeInTheDocument();
  });

  it("opens the comments tab from the page section Django returns to, and posts a comment", async () => {
    const calls = api({
      "POST forms/": { message: "نظر ثبت شد.", redirect: { href: "/risks/1/#comments", route: "/risks/1#comments" } },
    });
    const { user } = renderApp("/risks/1#comments");
    const tab = await screen.findByRole("tab", { name: /نظرها/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
    await user.type(screen.getByRole("textbox", { name: "نظر تازه" }), "نظر آزمون");
    await user.click(screen.getByRole("button", { name: "ثبت نظر" }));
    await waitFor(() => expect(calls.callsTo("POST forms/")).toHaveLength(1));
    expect(calls.callsTo("POST forms/")[0]!.query.get("path")).toBe("/comments/29/1/new/");
    await expectNoAxeViolations();
  });

  it("compares the picked assessments on their own page and opens each one from there", async () => {
    const risk = riskDetail();
    const [first] = risk.assessments;
    risk.assessments.push({
      ...first!,
      id: 2,
      code: "AS-1405-0002",
      kind: { value: "target", label: "هدف" },
      status: { value: "draft", label: "پیش‌نویس" },
      approved_at: null,
      href: "/assessments/2/",
    });
    api({
      "GET risks/1/": risk,
      "GET pages/": (call: ApiCall) =>
        call.query.get("path") === "/assessments/compare/?id=2&id=1" ? compareAssessments() : assessmentDetail(),
    });
    const { router, user } = renderApp("/risks/1?tab=assessments");
    const compare = await screen.findByRole("button", { name: "مقایسه‌ی انتخاب‌شده‌ها" });
    expect(compare).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "مقایسه‌ی AS-1405-0002" }));
    expect(compare).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "مقایسه‌ی AS-1405-0001" }));
    await user.click(compare);

    expect(await screen.findByRole("heading", { name: "مقایسه‌ی ارزیابی‌ها", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe("/assessments/compare?id=2&id=1");
    await user.click(screen.getByRole("link", { name: "AS-1405-0001" }));
    expect(await screen.findByRole("heading", { name: "ارزیابی جاری AS-1405-0001", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/assessments/1");
  });
});
