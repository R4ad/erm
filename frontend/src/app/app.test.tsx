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
    // منوی فیگما: میز کار و سه ماژول با گام‌های شماره‌دار؛ پیوندها با مسیر خود رابط باز می‌شوند.
    expect(within(nav!).getByRole("link", { name: "رجیستر ریسک" })).toHaveAttribute("href", "/risks");
    expect(within(nav!).getByRole("link", { name: /اعلان‌های پایش/ })).toHaveAttribute("href", "/actions/notices");
    expect(screen.getByRole("link", { name: "رفتن به محتوای صفحه" })).toHaveAttribute("href", "#main");
    await expectNoAxeViolations();
  });

  it("shows the Figma task queue with the server's KPIs", async () => {
    api();
    const { user } = renderApp();
    const stat = async (label: string) =>
      (await screen.findByText(label)).parentElement?.nextElementSibling?.textContent;
    expect(await stat("منتظر اقدام من")).toBe("۳");
    expect(await stat("عقب‌افتاده")).toBe("۱");
    expect(await stat("سررسید امروز")).toBe("۰");
    expect(screen.getByText("سلام کاربر؛ ۳ کار منتظر اقدام شماست و ۰ مورد امروز سررسید دارد.")).toBeInTheDocument();

    const queue = screen.getByRole("region", { name: "صف کارها" });
    // کاری که صفحه‌ی React دارد درون برنامه باز می‌شود؛ بقیه در صفحه‌های فعلی.
    expect(within(queue).getByRole("link", { name: /پاسخ به پرسش ریسک/ })).toHaveAttribute(
      "href",
      "/questionnaires/risk-questions",
    );
    expect(within(queue).getByRole("link", { name: /اقدام آزمون عقب‌افتاده/ })).toHaveAttribute("href", "/actions/2/");

    await user.click(within(queue).getByRole("tab", { name: /پرسش‌ها/ }));
    expect(within(queue).queryByRole("link", { name: /اقدام آزمون عقب‌افتاده/ })).not.toBeInTheDocument();
    expect(within(queue).getByText("نمایش ۱ از ۱ کار")).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "برنامه‌ی درمان — حال طرح‌ها" })).toHaveTextContent("بدون طرح");
    expect(screen.getByRole("region", { name: "پذیرش‌های رو به انقضا" })).toHaveTextContent("منقضی‌شده");
    await expectNoAxeViolations();
  });

  it("lists a returned questionnaire response without a risk level", async () => {
    const work = myWork();
    const [question] = work.tasks.filter((task) => task.key === "question-4");
    work.tasks = [
      {
        ...question!,
        key: "response-4",
        title: "تکمیل پاسخنامه‌ی QR-1405-0109",
        kind: "پاسخنامه",
        code: "QR-1405-0109",
        href: "/app/questionnaire-answers?response=4",
        route: "/questionnaire-answers?response=4",
        icon: "file-text",
        cta_style: "primary",
        level: null,
        rated: false,
      },
    ];
    api({ "GET my-work/": work });
    renderApp();

    const queue = await screen.findByRole("region", { name: "صف کارها" });
    const row = within(queue)
      .getByRole("link", { name: /تکمیل پاسخنامه‌ی/ })
      .closest("li")!;
    expect(within(row).getByRole("link", { name: /تکمیل پاسخنامه‌ی/ })).toHaveAttribute(
      "href",
      "/questionnaire-answers?response=4",
    );
    expect(row).not.toHaveTextContent("ارزیابی‌نشده");
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

    await user.click(within(tabs).getByRole("tab", { name: /خط زمانی/ }));
    expect(router.state.location.search).toBe("?tab=timeline");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("دلیل آزمونی انتقال");

    await user.click(within(tabs).getByRole("tab", { name: "خلاصه" }));
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
    // انتقالی که شرطش برقرار نیست دکمه نمی‌شود و دلیلش زیر دکمه‌هاست؛ کار اصلی دیدن طرح است.
    expect(await screen.findByText(/«شروع اجرا» هنوز فعال نیست: مالک ریسک هنوز طرح/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "شروع اجرا" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "مشاهده‌ی طرح مواجهه" })[0]).toHaveAttribute("href", "/actions/plans/1");

    await user.click(screen.getByRole("button", { name: "پیشنهاد ادغام یا تفکیک" }));
    const changes = await screen.findByRole("menu");
    expect(within(changes).getByRole("menuitem", { name: "پیشنهاد ادغام" })).toHaveAttribute(
      "href",
      "/workflow/risks/1/requests/merge",
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("link", { name: /^افزودن\s*شاهد/ })).toHaveAttribute("href", "/risks/evidence/new?risk=1");

    await user.click(screen.getByRole("button", { name: "کارهای دیگر پرونده" }));
    const menu = await screen.findByRole("menu");
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

  it("puts an allowed transition first and shows the merged risk", async () => {
    const risk = riskDetail();
    risk.workflow.transitions[0]!.problems = [];
    risk.workflow.merged_into = { code: "RK-1405-0009", href: "/risks/9/" };
    api({ "GET risks/1/": risk });
    renderApp("/risks/1");
    expect(await screen.findByRole("link", { name: "شروع اجرا" })).toHaveAttribute(
      "href",
      "/workflow/risks/1/transition/start_treatment",
    );
    expect(screen.getByRole("link", { name: "RK-1405-0009" })).toHaveAttribute("href", "/risks/9");
    expect(screen.queryByText(/هنوز فعال نیست/)).not.toBeInTheDocument();
  });

  it("follows the Figma summary: lifecycle, deadline, latest result, controls and evidence", async () => {
    const risk = riskDetail();
    risk.evidence = Array.from({ length: 6 }, (_, index) => ({
      ...risk.evidence[index % 2]!,
      code: `EV-1405-000${index + 1}`,
    }));
    api({ "GET risks/1/": risk });
    const { router, user } = renderApp("/risks/1");

    const steps = await screen.findByRole("list", { name: "مراحل گردش کار" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(7);
    const current = within(steps)
      .getByText(/برنامه‌ی درمان/)
      .closest("li");
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveTextContent("از ۱۴۰۵/۰۸/۱۱");
    expect(within(steps).getByText(/این ریسک از این مرحله نگذشت/)).toBeInTheDocument();

    const deadline = screen.getByRole("region", { name: "مهلت" });
    expect(deadline).toHaveTextContent("مهلت ثبت طرح مواجهه: ۳ روز کاری مانده");
    expect(within(deadline).getByRole("link", { name: /رفتن به طرح/ })).toHaveAttribute("href", "/actions/plans/1");

    const result = screen.getByRole("heading", { name: "نتیجه‌ی آخرین ارزیابی جاری" }).closest("div.rounded-lg");
    expect(result).toHaveTextContent("آغازگر (A)۳");
    expect(result).toHaveTextContent("سطح تصمیمبالا");
    expect(result).toHaveTextContent("پس کف تغییری نداد");

    expect(screen.getByText("بدون شاهد معتبر")).toHaveAttribute("title", "ارزیابی اثربخشی ندارد");
    expect(screen.getByText("کلیدی")).toBeInTheDocument();
    expect(screen.getAllByText("منقضی").length).toBeGreaterThan(0);
    expect(screen.getByText(/۶ شاهد · قدمت مجاز شاهد کنترل کلیدی ۹۰ روز/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "دیدن همه‌ی ۶ شاهد" }));
    expect(router.state.location.search).toBe("?tab=evidence");
    expect(screen.getByRole("tabpanel").querySelectorAll("li")).toHaveLength(6);
    await expectNoAxeViolations();
  });

  it("opens the comments tab from the page section Django returns to, and posts a comment", async () => {
    const calls = api({
      "POST forms/": { message: "نظر ثبت شد.", redirect: { href: "/risks/1/#comments", route: "/risks/1#comments" } },
    });
    const { user } = renderApp("/risks/1#comments");
    const tab = await screen.findByRole("tab", { name: /پیوست و نظر/ });
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
    expect(
      await screen.findByRole("heading", { name: "ارزیابی جاری — ریسک آزمون شماره‌ی ۱", level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/assessments/1");
  });
});
