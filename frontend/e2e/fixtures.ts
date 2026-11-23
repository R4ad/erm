import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page, type Request } from "@playwright/test";

import * as data from "../src/test/fixtures";

// هر آزمون سرتاسری API را در خود مرورگر جواب می‌دهد، با همان داده‌ی آزمون Vitest (src/test/fixtures.ts). جنگو و
// پایگاه داده لازم نیست و هیچ‌کدام از این جواب‌ها در برنامه نیست؛ برنامه همیشه از API واقعی می‌خواند.

export interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

type Answer = { status: number; body: unknown };
type Handler = (call: ApiCall) => Answer | unknown;

const REPLY = Symbol.for("e2e-reply");

export function reply(status: number, body: unknown = {}): Answer {
  return { [REPLY]: true, status, body } as Answer;
}

function isReply(value: unknown): value is Answer {
  return typeof value === "object" && value !== null && REPLY in value;
}

function defaults(): Record<string, Handler | unknown> {
  return {
    "GET auth/csrf/": data.csrf(),
    "GET session/": data.session(),
    "GET my-work/": data.myWork(),
    "GET risks/filters/": data.riskFilters(),
    "GET risks/": (call: ApiCall) => {
      const page = data.riskPage({ pages: 3 });
      const q = call.query.get("q");
      const status = call.query.get("status");
      page.results = page.results.filter(
        (risk) => (!q || risk.title.includes(q) || risk.code.includes(q)) && (!status || risk.status.value === status),
      );
      page.count = page.results.length;
      page.page = Number(call.query.get("page") ?? 1);
      page.ordering = (call.query.get("ordering") ?? "newest") as typeof page.ordering;
      return page;
    },
    "GET risks/1/": data.riskDetail(),
    "GET risk-questions/": data.riskQuestions(),
    // پل فرم‌ها و صفحه‌های جنگو: هر نشانی جنگو (?path=) جواب خودش را دارد.
    "GET forms/": byPath({
      "/risks/1/edit/": data.riskForm(),
      "/attachments/29/1/new/": data.uploadForm(),
      "/workflow/risks/1/transition/start_treatment/": data.transitionForm(),
      "/assessments/1/initiator/": data.initiatorForm(),
      "/assessments/1/impacts/": data.impactProfileForm(),
      "/actions/plans/1/reassess/": data.reassessmentForm(),
      "/controls/1/effectiveness/new/": data.controlAssessmentForm(),
      "/catalog/services/1/dependencies/new/supplier/": data.dependencyForm(),
      "/holidays/new/": data.holidayForm(),
      "/accounts/staff-import/": data.staffImportForm(),
    }),
    "POST forms/": (call: ApiCall) => saved(call),
    "GET pages/": byPath({
      "/risks/evidence/": (call: ApiCall) => {
        const page = data.evidenceList();
        const kind = djangoQuery(call).get("kind");
        page.results = page.results.filter((row) => !kind || row.kind.value === kind);
        page.count = page.results.length;
        return page;
      },
      "/risks/evidence/1/": data.evidenceDetail(),
      "/risks/coverage/": data.coverage(),
      "/workflow/requests/7/": data.changeDetail(),
      "/assessments/1/": data.assessmentDetail(),
      "/assessments/compare/": data.compareAssessments(),
      "/actions/": (call: ApiCall) => {
        const page = data.actionList();
        const overdue = djangoQuery(call).get("overdue");
        page.results = page.results.filter((row) => !overdue || row.status.overdue);
        page.count = page.results.length;
        return page;
      },
      "/actions/acceptances/": data.acceptanceList(),
      "/actions/plans/1/": data.planDetail(),
      "/actions/1/": data.actionDetail(),
      "/actions/acceptances/2/": data.acceptanceDetail(),
      "/actions/notices/": data.notices(),
      "/actions/reviews/1/": data.reviewDetail(),
      "/controls/": data.controlList(),
      "/controls/1/": data.controlDetail(),
      "/controls/effectiveness/3/": data.controlAssessmentDetail(),
      "/controls/soa/": (call: ApiCall) => {
        const page = data.soaList();
        const state = djangoQuery(call).get("state");
        page.results = page.results.filter(
          (row) => !state || (state === "gap" ? row.gap : row.applicability.value === state),
        );
        page.count = page.results.length;
        return page;
      },
      "/controls/soa/1/": data.soaGapDetail(),
      "/controls/soa/15/": data.soaDetail(),
      "/catalog/services/": data.serviceList(),
      "/catalog/services/1/": data.serviceDetail(),
      "/catalog/commitments/": data.commitmentList(),
      "/catalog/assets/": data.assetList(),
      "/catalog/assets/1/": data.assetDetail(),
      "/catalog/suppliers/": data.supplierList(),
      "/catalog/suppliers/1/": data.supplierDetail(),
      "/catalog/customers/": data.customerList(),
      "/units/": data.unitList(),
      "/method/": data.methodPage(),
      "/accounts/users/": data.userList(),
      "/holidays/": data.holidayList(),
      "/audit/": (call: ApiCall) => {
        const query = djangoQuery(call).toString();
        return data.auditEventList({ export_url: `/audit/export/${query ? `?${query}` : ""}` });
      },
      "/audit/changes/": data.auditChangeList(),
    }),
  };
}

/** نشانی جنگویی که رابط از پل خواسته، با query خودش. */
function djangoQuery(call: ApiCall) {
  return new URL(call.query.get("path") ?? "/", "http://django.test").searchParams;
}

/** جواب پل بر پایه‌ی نشانی جنگو (بدون query)؛ نشانی ناشناخته همان ۴۰۴ جنگوست. */
function byPath(pages: Record<string, Handler | unknown>): Handler {
  return (call) => {
    const path = (call.query.get("path") ?? "").split("?")[0]!;
    const page = pages[path];
    if (page === undefined) return reply(404, { detail: "صفحه پیدا نشد." });
    return typeof page === "function" ? (page as Handler)(call) : page;
  };
}

/** جواب ذخیره‌ی موفق، مثل جنگو: پیام و مقصد بعدی. */
function saved(call: ApiCall) {
  const path = call.query.get("path") ?? "";
  if (path.startsWith("/attachments/")) {
    return {
      message: "پیوست بارگذاری شد.",
      redirect: { href: "/risks/1/#attachments", route: "/risks/1#attachments" },
    };
  }
  if (path.startsWith("/assessments/1/submit/")) {
    return {
      message: "ارزیابی AS-1405-0001 برای کنترل کیفیت فرستاده شد.",
      redirect: { href: "/assessments/1/#review", route: "/assessments/1#review" },
    };
  }
  if (path.startsWith("/assessments/")) {
    return {
      message: "پروفایل پیامد ارزیابی AS-1405-0001 ذخیره شد.",
      redirect: { href: "/assessments/1/", route: "/assessments/1" },
    };
  }
  if (path.startsWith("/actions/plans/1/approve/")) {
    return { message: "طرح تأیید شد.", redirect: { href: "/actions/plans/1/", route: "/actions/plans/1" } };
  }
  if (path.startsWith("/actions/1/move/")) {
    return { message: "وضعیت اقدام ثبت شد.", redirect: { href: "/actions/1/#progress", route: "/actions/1#progress" } };
  }
  if (path.startsWith("/actions/acceptances/2/")) {
    return {
      message: "امضای شما ثبت شد.",
      redirect: { href: "/actions/acceptances/2/#signatures", route: "/actions/acceptances/2#signatures" },
    };
  }
  if (path.startsWith("/actions/notices/")) {
    return { message: "اعلان خوانده شد.", redirect: { href: "/actions/notices/", route: "/actions/notices" } };
  }
  if (path.startsWith("/actions/reviews/")) {
    return { message: "نتیجه بازبینی ثبت شد.", redirect: { href: "/actions/reviews/1/", route: "/actions/reviews/1" } };
  }
  if (path.startsWith("/controls/1/effectiveness/new/")) {
    return {
      message: "ارزیابی اثربخشی CA-1405-0003 با E3 ثبت شد.",
      redirect: { href: "/controls/effectiveness/3/", route: "/controls/effectiveness/3" },
    };
  }
  if (path.startsWith("/catalog/services/1/dependencies/")) {
    return {
      message: "وابستگی خدمت «درگاه پرداخت اینترنتی» به «شرکت پشتیبانی سخت‌افزار» ذخیره شد.",
      redirect: { href: "/catalog/services/1/", route: "/catalog/services/1" },
    };
  }
  if (path === "/accounts/staff-import/") return data.staffImportDryRun();
  if (path === "/accounts/staff-import/confirm/") return data.staffImportDone();
  if (path.startsWith("/holidays/")) {
    return { message: "تعطیلی «تعطیلی آزمون یکم» حذف شد.", redirect: { href: "/holidays/", route: "/holidays" } };
  }
  if (path.startsWith("/workflow/requests/")) {
    return { message: "پیشنهاد تأیید شد.", redirect: { href: "/workflow/requests/7/", route: "/workflow/requests/7" } };
  }
  return { message: "ریسک ذخیره شد.", redirect: { href: "/risks/1/", route: "/risks/1" } };
}

export class MockApi {
  readonly calls: ApiCall[] = [];
  private routes = defaults();

  /** جواب یک «روش مسیر» را برای همین آزمون عوض می‌کند. */
  on(key: string, handler: Handler | unknown) {
    this.routes[key] = handler;
  }

  callsTo(key: string) {
    return this.calls.filter((call) => `${call.method} ${call.path}` === key);
  }

  async install(page: Page) {
    await page.route("**/api/**", async (route) => {
      const call = toCall(route.request());
      this.calls.push(call);
      const key = `${call.method} ${call.path}`;
      const handler = this.routes[key];
      if (handler === undefined) {
        console.warn(`e2e: no mock for ${key}`);
        await route.fulfill({ status: 502, json: {} });
        return;
      }
      const answer = typeof handler === "function" ? await (handler as Handler)(call) : handler;
      const { status, body } = isReply(answer) ? answer : { status: 200, body: answer };
      await route.fulfill({ status, json: body });
    });
  }
}

function toCall(request: Request): ApiCall {
  const url = new URL(request.url());
  const raw = request.postData();
  const headers = request.headers();
  // فرم با فایل multipart است و همان متن خام می‌ماند تا آزمون نام فایل و فیلدها را در آن ببیند.
  const json = headers["content-type"]?.includes("application/json");
  return {
    method: request.method(),
    path: url.pathname.replace(/^\/api\//, ""),
    query: url.searchParams,
    body: raw ? (json ? JSON.parse(raw) : raw) : undefined,
    headers,
  };
}

export interface TestOptions {
  /** خطاهای کنسول که این آزمون انتظارشان را دارد (مثلاً جواب ۴۰۰ ورود اشتباه). */
  allowConsoleErrors: RegExp[];
}

export const test = base.extend<TestOptions & { api: MockApi }>({
  allowConsoleErrors: [[], { option: true }],
  // خودکار: حتی آزمونی که api را نمی‌خواهد، جواب‌های پیش‌فرض را می‌گیرد.
  api: [
    async ({ page }, use) => {
      const api = new MockApi();
      await api.install(page);
      await use(api);
    },
    { auto: true },
  ],
  page: async ({ page, allowConsoleErrors }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        (window as unknown as { __csp: string[] }).__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    // هر صفحه باید زیر CSP و Trusted Types واقعی بدون هیچ تخلف و خطای پیش‌بینی‌نشده‌ای کار کند.
    const violations = await page
      .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
      .catch(() => []);
    expect(violations, "CSP violations").toEqual([]);
    expect(
      errors.filter((text) => !allowConsoleErrors.some((pattern) => pattern.test(text))),
      "console errors",
    ).toEqual([]);
  },
});

export { expect };

/** axe روی صفحه‌ی فعلی با قاعده‌های WCAG 2.2 AA، از جمله تضاد رنگ در تم فعلی. */
export async function expectAccessible(page: Page, include?: string) {
  // انیمیشن ورود عناصر تمام شود تا axe رنگ نیمه‌شفاف میانه‌ی انیمیشن را تضاد کم نبیند.
  await page.waitForTimeout(400);
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const report = result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes
        .slice(0, 5)
        .map((node) => `  ${node.target.join(" ")} ${node.failureSummary?.split("\n").slice(1, 2).join("") ?? ""}`)
        .join("\n"),
  );
  expect(report, report.join("\n\n")).toEqual([]);
}
