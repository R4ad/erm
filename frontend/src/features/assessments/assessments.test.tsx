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
  it("shows the engine result, the paths and the impact matrix Django computed", async () => {
    dossier(assessmentDetail());
    expect(await screen.findByRole("heading", { name: "ارزیابی جاری AS-1405-0001", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("پیش‌نویس")).toBeInTheDocument();
    const sections = screen.getByRole("navigation", { name: "بخش‌های ارزیابی" });
    expect(within(sections).getByRole("link", { name: "کنترل کیفیت" })).toHaveAttribute("href", "#review");

    const result = screen.getByRole("region", { name: "نتیجه" });
    expect(within(result).getByText("امتیاز (L × I)").nextSibling).toHaveTextContent("۶");
    expect(within(result).getByText("سطح پایه").nextSibling).toHaveTextContent(levels.medium.name);
    expect(within(result).getByText("سطح تصمیم").nextSibling).toHaveTextContent(levels.medium.name);
    expect(result).toHaveTextContent("محاسبه‌ی همین حالا؛ هنگام تأیید ثابت می‌شود");

    const likelihood = screen.getByRole("region", { name: "احتمال" });
    expect(within(likelihood).getByRole("link", { name: "عامل آغازگر (A)" })).toHaveAttribute(
      "href",
      "/assessments/1/initiator",
    );
    expect(within(likelihood).getByRole("link", { name: "مسیر تازه" })).toHaveAttribute(
      "href",
      "/assessments/1/paths/new",
    );
    expect(within(likelihood).getByRole("link", { name: "EV-1405-0001" })).toHaveAttribute("href", "/risks/evidence/1");
    const path = within(likelihood)
      .getByRole("rowheader", { name: /مسیر آزمون/ })
      .closest("tr")!;
    expect(path).toHaveAttribute("id", "path-1");
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
    await expectNoAxeViolations();
  });

  it("sends the assessment for quality control through the Django view and reloads it", async () => {
    const answer = deferred();
    const { api, user } = dossier(assessmentDetail(), answer.promise);
    const review = await screen.findByRole("region", { name: "کنترل کیفیت" });
    await user.type(within(review).getByRole("textbox", { name: "توضیح برای کنترل‌کننده (اختیاری)" }), "آماده است");
    await user.click(within(review).getByRole("button", { name: "ارسال برای کنترل کیفیت" }));

    expect(within(review).getByRole("button", { name: /ارسال برای کنترل کیفیت/ })).toHaveAttribute("aria-busy", "true");
    expect(sent(api)).toEqual([{ path: "/assessments/1/submit/", body: { values: { notes: "آماده است" } } }]);
    answer.resolve({
      message: "ارزیابی برای کنترل کیفیت فرستاده شد.",
      redirect: { href: "/assessments/1/#review", route: "/assessments/1#review" },
    });
    expect(await screen.findByText("ارزیابی برای کنترل کیفیت فرستاده شد.")).toBeInTheDocument();
    // داده‌ی پرونده دوباره از جنگو خوانده می‌شود؛ همان صفحه است، پس جایی رفته نمی‌شود.
    await waitFor(() => expect(api.callsTo("GET pages/")).toHaveLength(2));
  });

  it("lists what blocks sending instead of the send button", async () => {
    const data = assessmentDetail();
    data.review.submission_problems = ["پروفایل پیامد هنوز ثبت نشده است."];
    dossier(data);
    const review = await screen.findByRole("region", { name: "کنترل کیفیت" });
    expect(review).toHaveTextContent("پیش از ارسال برای کنترل کیفیت لازم است:");
    expect(review).toHaveTextContent("پروفایل پیامد هنوز ثبت نشده است.");
    expect(within(review).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets a checker approve after confirming, and shows Django's refusal of an empty return", async () => {
    const { api, user } = dossier(assessmentInReview(), (call: ApiCall) =>
      (call.body as { values: { action: string } }).values.action === "return"
        ? reply(400, { message: "برای برگشت یا ارجاع، اختلاف یا کمبود را بنویسید.", errors: {} })
        : { message: "ارزیابی تأیید شد.", redirect: null },
    );
    const review = await screen.findByRole("region", { name: "کنترل کیفیت" });
    // کسی که کنترل می‌کند پرونده را ویرایش نمی‌کند.
    expect(screen.queryByRole("link", { name: "ویرایش" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /حذف مسیر/ })).not.toBeInTheDocument();
    expect(within(review).getByRole("list", { name: "سابقه‌ی کنترل کیفیت" })).toHaveTextContent("توضیح آزمونی ارسال");
    const notes = within(review).getByRole("textbox", { name: "توضیح" });
    expect(notes).toHaveAccessibleDescription("برای برگشت و ارجاع اجباری است.");

    await user.click(within(review).getByRole("button", { name: "برگشت به ارزیاب" }));
    expect(await within(review).findByRole("alert")).toHaveTextContent("اختلاف یا کمبود را بنویسید");

    await user.click(within(review).getByRole("button", { name: "تأیید ارزیابی" }));
    const dialog = await screen.findByRole("alertdialog", { name: "ارزیابی AS-1405-0001 تأیید شود؟" });
    await user.click(within(dialog).getByRole("button", { name: "تأیید ارزیابی" }));
    await waitFor(() =>
      expect(sent(api).at(-1)).toEqual({
        path: "/assessments/1/review/",
        body: { values: { action: "approve", notes: "" } },
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
    const review = await screen.findByRole("region", { name: "کنترل کیفیت" });
    const date = within(review).getByRole("textbox", { name: "تاریخ جلسه‌ی کارگروه" });
    await user.type(date, "۱۴۰۵/۸/۱۰");
    await user.tab();
    expect(date).toHaveValue("1405/08/10");
    await user.type(within(review).getByRole("textbox", { name: "تصمیم کارگروه" }), "B0 همان ۳ است");
    await user.click(within(review).getByRole("button", { name: "تأیید ارزیابی با تصمیم کارگروه" }));
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
