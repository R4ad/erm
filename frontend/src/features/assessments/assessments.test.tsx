import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { deferred, mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { assessmentDetail, assessmentInReview, compareAssessments, impactProfileForm, levels } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { AssessmentDetailPage } from "./AssessmentDetailPage";
import { ComparePage } from "./ComparePage";
import { ImpactProfilePage } from "./ImpactProfilePage";

function dossier(page: unknown, post: unknown = { message: "انجام شد.", redirect: null }) {
  const api = mockApi({
    "GET pages/": (call: ApiCall) => (call.query.get("path") === "/assessments/1/" ? page : reply(404, {})),
    "POST forms/": post,
  });
  const view = renderPage(<AssessmentDetailPage />, { path: "/assessments/1", route: "/assessments/:pk" });
  return { api, ...view };
}

const sent = (api: ReturnType<typeof mockApi>) =>
  api.callsTo("POST forms/").map((call) => ({ path: call.query.get("path"), body: call.body }));

describe("AssessmentDetailPage", () => {
  it("follows the Figma QC dossier: header, steps, calculation chain, paths and inputs", async () => {
    dossier(assessmentDetail());
    expect(
      await screen.findByRole("heading", { name: "ارزیابی جاری — ریسک آزمون شماره‌ی ۱", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("پیش‌نویس")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "نسخه‌ی روش ۱" })).toHaveAttribute("href", "/method/1");
    expect(screen.getByRole("link", { name: "RK-1405-0001" })).toHaveAttribute("href", "/risks/1");

    const steps = screen.getByRole("list", { name: "گام‌های ارزیابی" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(6);
    const current = within(steps)
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent("نتیجه و تصمیم");
    expect(current).toHaveTextContent("موقت تا تأیید");

    const chain = screen.getByRole("region", { name: "زنجیره‌ی محاسبه" });
    expect(chain).toHaveTextContent("موقت");
    expect(within(chain).getByText("احتمال").nextSibling).toHaveTextContent("L = ۲");
    expect(within(chain).getByText("امتیاز").nextSibling).toHaveTextContent("۶");
    expect(within(chain).getByText("سطح تصمیم").nextSibling).toHaveTextContent(levels.medium.name);
    const grid = within(chain).getByRole("table", { name: "جدول احتمال A × B نسخه‌ی روش" });
    const hit = within(grid)
      .getAllByRole("cell")
      .find((cell) => cell.getAttribute("aria-current") === "true");
    expect(hit).toHaveTextContent("۲");
    expect(chain).toHaveTextContent("«مسیر آزمون» با B = ۳ تعیین‌کننده است.");

    const paths = screen.getByRole("region", { name: "مسیرهای تحقق و کنترل‌ها" });
    expect(within(paths).getByRole("link", { name: "افزودن مسیر" })).toHaveAttribute(
      "href",
      "/assessments/1/paths/new",
    );
    const path = within(paths)
      .getByRole("rowheader", { name: /مسیر آزمون/ })
      .closest("tr")!;
    expect(path).toHaveAttribute("id", "path-1");
    expect(within(path).getByRole("link", { name: "EV-1405-0002" })).toHaveAttribute("href", "/risks/evidence/2");
    expect(path).toHaveTextContent("بدون کنترل مؤثر");
    expect(within(path).getByRole("link", { name: "ویرایش مسیر مسیر آزمون" })).toHaveAttribute(
      "href",
      "/assessments/paths/1/edit",
    );

    const impacts = screen.getByRole("region", { name: "پروفایل پیامد" });
    const table = within(impacts).getByRole("table", { name: /سطح هر بُعد پیامد/ });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["بُعد", "داتین", "بانک آزمون"]);
    const financial = within(table).getByRole("rowheader", { name: /مالی/ }).closest("tr")!;
    expect(within(financial).getAllByRole("cell")[1]).toHaveTextContent("ثبت‌نشده");
    expect(within(impacts).getByRole("link", { name: "ثبت پروفایل پیامد" })).toHaveAttribute(
      "href",
      "/assessments/1/impacts",
    );

    const initiator = screen.getByRole("region", { name: "عامل آغازگر (A)" });
    expect(within(initiator).getByRole("link", { name: "EV-1405-0001" })).toHaveAttribute("href", "/risks/evidence/1");
    expect(within(initiator).getByRole("link", { name: "ثبت A" })).toHaveAttribute("href", "/assessments/1/initiator");

    const checks = screen.getByRole("region", { name: "بررسی‌های پیش از تأیید" });
    expect(checks).toHaveTextContent("مالک فعال، خدمت و دست‌کم یک بانک (برقرار)");
    expect(checks).toHaveTextContent("شاهد برای سطح‌های مثبت پیامد (برقرار نیست)");
    expect(checks).toHaveTextContent("خانه‌ی S · بانک آزمون (سطح ۳) شاهد ندارد");

    const flags = screen.getByRole("region", { name: "نشان‌های تقدم و اطمینان" });
    expect(within(flags).getByText("عبور از حد تحمل مشتری").nextSibling).toHaveTextContent("بله");
    expect(within(flags).getByText("رویداد در حال وقوع").nextSibling).toHaveTextContent("خیر");
    expect(flags).toHaveTextContent("اطمینان کلی ارزیابیمتوسط");
    await expectNoAxeViolations();
  });

  it("keeps the other assessment tasks in the dots menu", async () => {
    const { user } = dossier(assessmentDetail());
    await user.click(await screen.findByRole("button", { name: "کارهای دیگر ارزیابی" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "ویرایش ارزیابی" })).toHaveAttribute(
      "href",
      "/assessments/1/edit",
    );
    expect(within(menu).getByRole("menuitem", { name: "پرونده‌ی ریسک" })).toHaveAttribute("href", "/risks/1");
    expect(within(menu).getByRole("menuitem", { name: "پرونده در صفحه‌های فعلی" })).toHaveAttribute(
      "href",
      "/assessments/1/",
    );
  });

  it("sends the assessment for quality control with the note beside it and reloads it", async () => {
    const answer = deferred();
    const { api, user } = dossier(assessmentDetail(), answer.promise);
    const notes = await screen.findByRole("region", { name: "یادداشت‌های کنترل کیفیت" });
    await user.type(within(notes).getByRole("textbox", { name: "توضیح برای کنترل‌کننده (اختیاری)" }), "آماده است");
    await user.click(screen.getByRole("button", { name: "ارسال برای کنترل کیفیت" }));

    expect(screen.getByRole("button", { name: /ارسال برای کنترل کیفیت/ })).toHaveAttribute("aria-busy", "true");
    expect(sent(api)).toEqual([{ path: "/assessments/1/submit/", body: { values: { notes: "آماده است" } } }]);
    answer.resolve({
      message: "ارزیابی برای کنترل کیفیت فرستاده شد.",
      redirect: { href: "/assessments/1/#review", route: "/assessments/1#review" },
    });
    expect(await screen.findByText("ارزیابی برای کنترل کیفیت فرستاده شد.")).toBeInTheDocument();
    // داده‌ی پرونده دوباره از جنگو خوانده می‌شود؛ همان صفحه است، پس جایی رفته نمی‌شود.
    await waitFor(() => expect(api.callsTo("GET pages/")).toHaveLength(2));
  });

  it("points to the open checks instead of offering the send button", async () => {
    const data = assessmentDetail();
    data.review.submission_problems = ["خانه‌ی S · بانک آزمون (سطح ۳) شاهد ندارد"];
    dossier(data);
    expect(
      await screen.findByText("ارسال برای کنترل کیفیت هنوز ممکن نیست؛ موارد باز در «بررسی‌های پیش از تأیید» آمده است."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ارسال برای کنترل کیفیت/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /توضیح برای کنترل‌کننده/ })).not.toBeInTheDocument();
  });

  it("lets a checker return only with a note and approve after confirming", async () => {
    const { api, user } = dossier(assessmentInReview(), (call: ApiCall) =>
      (call.body as { values: { action: string } }).values.action === "refer"
        ? reply(400, { message: "ارجاع فقط از کنترل کیفیت ممکن است.", errors: {} })
        : { message: "ارزیابی تأیید شد.", redirect: null },
    );
    expect(await screen.findByText("شما ارزیاب این پرونده نیستید؛ تأیید یا بازگرداندن مجاز است.")).toBeInTheDocument();
    // کسی که کنترل می‌کند پرونده را ویرایش نمی‌کند.
    expect(screen.queryByRole("link", { name: "افزودن مسیر" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حذف مسیر/ })).not.toBeInTheDocument();
    const notes = screen.getByRole("region", { name: "یادداشت‌های کنترل کیفیت" });
    expect(within(notes).getByRole("list", { name: "سابقه‌ی کنترل کیفیت" })).toHaveTextContent("توضیح آزمونی ارسال");
    const note = within(notes).getByRole("textbox", { name: "یادداشت برای ارزیاب" });
    expect(note).toHaveAccessibleDescription("برای برگشت و ارجاع اجباری است.");

    await user.click(screen.getByRole("button", { name: "بازگرداندن با یادداشت" }));
    expect(note).toHaveFocus();
    expect(note).toHaveAccessibleDescription(/یادداشتی برای ارزیاب بنویسید/);
    expect(sent(api)).toEqual([]);

    await user.type(note, "شاهد بانک آزمون کم است");
    await user.click(screen.getByRole("button", { name: "ارجاع به کارگروه" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ارجاع فقط از کنترل کیفیت ممکن است.");
    expect(sent(api)).toEqual([
      { path: "/assessments/1/review/", body: { values: { action: "refer", notes: "شاهد بانک آزمون کم است" } } },
    ]);

    await user.click(screen.getByRole("button", { name: "تأیید ارزیابی" }));
    const dialog = await screen.findByRole("alertdialog", { name: "ارزیابی AS-1405-0001 تأیید شود؟" });
    await user.click(within(dialog).getByRole("button", { name: "تأیید ارزیابی" }));
    await waitFor(() =>
      expect(sent(api).at(-1)).toEqual({
        path: "/assessments/1/review/",
        body: { values: { action: "approve", notes: "شاهد بانک آزمون کم است" } },
      }),
    );
    expect(await screen.findByText("ارزیابی تأیید شد.")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("deletes a draft path only after asking", async () => {
    const { api, user } = dossier(assessmentDetail(), {
      message: "مسیر «مسیر آزمون» حذف شد.",
      redirect: { href: "/assessments/1/#likelihood", route: "/assessments/1#likelihood" },
    });
    await user.click(await screen.findByRole("button", { name: "حذف مسیر مسیر آزمون" }));
    const dialog = await screen.findByRole("alertdialog", { name: "مسیر «مسیر آزمون» حذف شود؟" });
    expect(sent(api)).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "حذف مسیر" }));
    await waitFor(() => expect(sent(api)).toEqual([{ path: "/assessments/paths/1/delete/", body: { values: {} } }]));
    expect(await screen.findByText("مسیر «مسیر آزمون» حذف شد.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("lets the security workgroup record its decision with the meeting date", async () => {
    const data = assessmentDetail();
    data.assessment.status = { value: "referred", label: "ارجاع به کارگروه" };
    data.review = {
      ...data.review,
      can_submit: false,
      can_decide_referral: true,
      referral_url: "/assessments/1/referral/",
    };
    const { api, user } = dossier(data);
    const notes = await screen.findByRole("region", { name: "یادداشت‌های کنترل کیفیت" });
    const date = within(notes).getByRole("textbox", { name: "تاریخ جلسه‌ی کارگروه" });
    await user.type(date, "۱۴۰۵/۸/۱۰");
    await user.tab();
    expect(date).toHaveValue("1405/08/10");
    await user.type(within(notes).getByRole("textbox", { name: "تصمیم کارگروه" }), "B0 همان ۳ است");
    await user.click(screen.getByRole("button", { name: "تأیید با تصمیم کارگروه" }));
    await waitFor(() =>
      expect(sent(api)).toEqual([
        {
          path: "/assessments/1/referral/",
          body: { values: { action: "workgroup_approve", notes: "B0 همان ۳ است", meeting_date: "1405/08/10" } },
        },
      ]),
    );
  });
});

function impactForm(
  post: unknown = { message: "ذخیره شد.", redirect: { href: "/assessments/1/", route: "/assessments/1" } },
) {
  const api = mockApi({
    "GET forms/": (call: ApiCall) =>
      call.query.get("path") === "/assessments/1/impacts/" ? impactProfileForm() : reply(404, {}),
    "POST forms/": post,
  });
  const view = renderPage(<ImpactProfilePage />, { path: "/assessments/1/impacts", route: "/assessments/:pk/impacts" });
  return { api, ...view, location: () => screen.getByTestId("location").textContent };
}

describe("ImpactProfilePage", () => {
  it("lays out one group per stakeholder and one labelled row per dimension", async () => {
    impactForm();
    expect(
      await screen.findByRole("heading", { name: "پروفایل پیامد ارزیابی جاری AS-1405-0001", level: 1 }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "ذی‌نفعان" });
    expect(within(nav).getByRole("link", { name: "بانک آزمون" })).toHaveAttribute("href", "#stakeholder-1");

    const datin = screen.getByRole("region", { name: "داتین" });
    expect(datin).toHaveTextContent("مبنای مالی داتین درآمد عملیاتی");
    const service = within(datin).getByRole("group", { name: "S خدمت و تداوم، داتین" });
    expect(within(service).getByRole("combobox", { name: "سطح" })).toHaveValue("0");
    expect(within(service).getByRole("option", { name: "ثبت‌نشده" })).toBeInTheDocument();
    expect(within(service).getByRole("combobox", { name: "اطمینان" })).toHaveValue("high");
    const financial = within(datin).getByRole("group", { name: "F مالی، داتین" });
    expect(within(financial).getByRole("spinbutton", { name: "مبنای مالی (ریال)" })).toHaveValue(null);
    expect(within(service).queryByRole("spinbutton", { name: "مبنای مالی (ریال)" })).not.toBeInTheDocument();

    const bank = screen.getByRole("region", { name: "بانک آزمون" });
    expect(bank).toHaveTextContent("خدمت حیاتی");
    expect(bank).toHaveTextContent("RTO۲۴۰ دقیقه");
    expect(bank).toHaveTextContent("MTPDثبت‌نشده");
    expect(bank).toHaveTextContent("۵٬۰۰۰٬۰۰۰٬۰۰۰ ریال");
    const bankService = within(bank).getByRole("group", { name: "S خدمت و تداوم، بانک آزمون" });
    expect(bankService).toHaveTextContent("پیشنهاد سامانه: سطح ۳. مدت اختلال بیش از یک‌چهارم RTO است.");
    expect(bankService).toHaveTextContent("سطح موقت کمتر از ۳ ثبت نشود");
    await expectNoAxeViolations();
  });

  it("sends every row under its own prefix and puts Django's errors next to the right cell", async () => {
    const { api, user } = impactForm(
      reply(400, {
        message: "بعضی خانه‌ها ایراد دارند؛ پیام زیر هر خانه را ببینید.",
        errors: { "7-F-rationale": ["صفر یعنی «اثر ندارد» و دلیل می‌خواهد."] },
      }),
    );
    const bank = await screen.findByRole("region", { name: "بانک آزمون" });
    const financial = within(bank).getByRole("group", { name: "F مالی، بانک آزمون" });
    await user.selectOptions(within(financial).getByRole("combobox", { name: "سطح" }), "0");
    await user.selectOptions(within(financial).getByRole("combobox", { name: "اطمینان" }), "high");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/assessments/1/impacts/");
    const values = (call!.body as { values: Record<string, unknown> }).values;
    expect(values).toMatchObject({
      "datin-S-level": "0",
      "datin-S-confidence": "high",
      "datin-F-level": "",
      "7-F-level": "0",
      "7-F-confidence": "high",
      "7-F-rationale": "",
      "7-F-evidence": [],
    });
    // دو ذی‌نفع، هر کدام S با شش فیلد و F با هفت فیلد (مبنای مالی).
    expect(Object.keys(values)).toHaveLength(26);

    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    const link = within(summary).getByRole("link", { name: /بانک آزمون، F مالی، دلیل: صفر یعنی/ });
    const rationale = within(financial).getByRole("textbox", { name: "دلیل" });
    expect(rationale).toHaveAttribute("aria-invalid", "true");
    expect(rationale).toHaveAccessibleDescription("صفر یعنی «اثر ندارد» و دلیل می‌خواهد.");
    await user.click(link);
    expect(rationale).toHaveFocus();
  });

  it("goes back to the dossier after saving", async () => {
    const { user, location } = impactForm();
    const datin = await screen.findByRole("region", { name: "داتین" });
    const financial = within(datin).getByRole("group", { name: "F مالی، داتین" });
    await user.selectOptions(within(financial).getByRole("combobox", { name: "سطح" }), "unknown");
    await user.type(within(financial).getByRole("textbox", { name: "دلیل" }), "صورت‌های مالی هنوز نرسیده است");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(location()).toBe("/assessments/1"));
    expect(await screen.findByText("ذخیره شد.")).toBeInTheDocument();
  });
});

function compare(page: unknown) {
  mockApi({
    "GET pages/": (call: ApiCall) =>
      call.query.get("path") === "/assessments/compare/?id=1&id=2" ? page : reply(404, {}),
  });
  return renderPage(<ComparePage />, { path: "/assessments/compare?id=1&id=2", route: "/assessments/compare" });
}

describe("ComparePage", () => {
  it("compares the assessments column by column with the direction of each change", async () => {
    compare(compareAssessments());
    expect(await screen.findByRole("heading", { name: "مقایسه‌ی ارزیابی‌ها", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "برگشت به ریسک" })).toHaveAttribute("href", "/risks/1#assessments");
    expect(screen.getByText(/نسخه‌ی روش این ارزیابی‌ها یکی نیست/)).toBeInTheDocument();

    const table = screen.getByRole("table", { name: /مقایسه‌ی ارزیابی‌های ریسک RK-1405-0001/ });
    const [, first, second] = within(table).getAllByRole("columnheader");
    expect(first).toHaveTextContent("AS-1405-0001جاری، روش نسخه‌ی ۱مبنای مقایسه");
    expect(second).toHaveTextContent("AS-1405-0002هدف، روش نسخه‌ی ۲ناقص");
    expect(within(second!).getByRole("link", { name: "AS-1405-0002" })).toHaveAttribute("href", "/assessments/2");

    const score = within(table).getByRole("rowheader", { name: "امتیاز L × I" }).closest("tr")!;
    expect(
      within(score)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["۱۲", "۱۵بیشتر از ستون اول"]);
    const decision = within(table).getByRole("rowheader", { name: "سطح تصمیم" }).closest("tr")!;
    expect(within(decision).getAllByRole("cell")[1]).toHaveTextContent(`${levels.medium.name}کمتر از ستون اول`);
    await expectNoAxeViolations();
  });

  it("explains when the picked assessments cannot be compared", async () => {
    compare(compareAssessments({ error: "دو تا چهار ارزیابی را برای مقایسه انتخاب کنید.", profiles: [], rows: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("دو تا چهار ارزیابی را برای مقایسه انتخاب کنید.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
