import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { activeRoute } from "@/components/layout/nav";
import type { PostAction, PostActionCard } from "@/lib/types";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { session } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { PostActionPage } from "./PostActionPage";

const high = { rank: 3, name: "بالا", color: "#fd7e14", text_color: "#000" };
const medium = { rank: 2, name: "متوسط", color: "#ffc107", text_color: "#000" };

function card(changes: Partial<PostActionCard> & Pick<PostActionCard, "key" | "title">): PostActionCard {
  return {
    hint: "",
    chip: null,
    current: false,
    a: "۴",
    b: "۳",
    l: "۳",
    i: "۳",
    score: "۹",
    level: medium,
    ...changes,
  };
}

function sheet(changes: Partial<PostAction> = {}): PostAction {
  return {
    plan: { id: 7, label: "طرح مواجهه‌ی RK-1405-0029 (کاهش)", href: "/actions/plans/7/" },
    risk: { code: "RK-1405-0029", title: "انتشار ساتنا", href: "/risks/29/" },
    title: "ارزیابی پس از اقدام · انتشار ساتنا",
    status: { label: "هدف محقق شد", tone: "success" },
    subtitle: "ارزیابی AS-1405-0034 برای RK-1405-0029 · ارزیاب: مریم صادقی",
    cards: [
      card({ key: "inherent", title: "ذاتی", b: "۴", l: "۴", score: "۱۲", level: high }),
      card({ key: "before", title: "جاری قبلی" }),
      card({ key: "target", title: "هدف طرح", b: "۲", i: "۲", score: "۶", chip: { label: "هدف", tone: "warning" } }),
      card({
        key: "after",
        title: "جاری جدید",
        i: "۲",
        score: "۶",
        current: true,
        chip: { label: "محقق", tone: "success" },
      }),
    ],
    compare_href: "/assessments/compare/?ids=31,32,33,34",
    waiting: null,
    summary: {
      title: "ریسک هدف محقق شد",
      text: "امتیاز جاری از ۹ به ۶ رسید و با هدف طرح برابر است",
      reached: true,
      rows: [
        { label: "سطح", value: "متوسط · بدون تغییر" },
        { label: "وضعیت ریسک", value: "پایش فعال · بسته نمی‌شود" },
      ],
    },
    paths: {
      subtitle: "B نهایی بیشینه‌ی مسیرهاست",
      rows: [
        {
          id: 12,
          name: "مسیر ۱ · انتشار عادی",
          b0: "۴",
          controls: [
            { code: "CT-0011", e: 3, label: "CT-0011 · E۳", tone: "success" },
            { code: "CT-0012", e: 2, label: "CT-0012 · E۲", tone: "warning" },
          ],
          bc: "۳",
          b: "۳",
        },
      ],
      total: "۳ · با A۴ رتبه‌ی L برابر ۳",
      note: "هدف B۲ محقق نشد، چون CT-0012 در آزمون اخیر از E۳ به E۲ افت کرد.",
    },
    profile: {
      subtitle: "پیامد I برابر بیشینه‌ی ابعاد است · از ۳ به ۲",
      rows: [
        { code: "S", name: "خدمت و تداوم", note: "بازگردانی خودکار", before: 3, after: 2, max: 5 },
        { code: "D", name: "داده و تمامیت", note: "بدون تغییر", before: 2, after: 2, max: 5 },
      ],
    },
    decision: {
      subtitle: "تصمیم مالک ریسک · سطح متوسط",
      can_decide: true,
      can_ask: true,
      owner: { id: 4, name: "حسین نوری" },
      options: [
        { value: "monitor", label: "پایش فعال با بازبینی سه‌ماهه", problems: [] },
        { value: "continue", label: "ادامه‌ی اصلاح تا B۲ · رفع شکاف CT-0012", problems: [] },
        { value: "accept", label: "پذیرش متوسط · حداکثر ۶ ماه", problems: [] },
      ],
      corrective: { label: "ایجاد اقدام اصلاحی برای CT-0012", count: 1 },
      problems: [],
      waiting: null,
      last: null,
    },
    evidence: [
      {
        id: 29,
        code: "EV-1405-0029",
        title: "لاگ بازگردانی خودکار",
        observed_on: "۱۴۰۵/۰۸/۱۰",
        href: "/risks/evidence/29/",
      },
    ],
    rules: ["ریسک پس از کاهش بسته نمی‌شود و به پایش فعال می‌رود"],
    ...changes,
  };
}

function render() {
  return renderPage(<PostActionPage />, {
    path: "/actions/plans/7/reassess",
    route: "/actions/plans/:plan_pk/reassess",
  });
}

describe("PostActionPage", () => {
  it("compares the four assessments and shows paths, the impact profile and the outcome", async () => {
    mockApi({ "GET actions/plans/7/post-action/": sheet() });
    const { container } = render();

    expect(
      await screen.findByRole("heading", { level: 1, name: "ارزیابی پس از اقدام · انتشار ساتنا" }),
    ).toBeInTheDocument();
    expect(screen.getByText("هدف محقق شد")).toBeInTheDocument();
    const after = screen.getByRole("region", { name: "جاری جدید" });
    expect(within(after).getByText("محقق")).toBeInTheDocument();
    expect(within(after).getByText("۶")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "ذاتی" })).toHaveTextContent("۱۲");

    const paths = screen.getByRole("table", { name: /مسیرهای احتمال/ });
    expect(within(paths).getByText("CT-0012 · E۲")).toBeInTheDocument();
    expect(screen.getByText("۳ · با A۴ رتبه‌ی L برابر ۳")).toBeInTheDocument();
    expect(screen.getByText(/از E۳ به E۲ افت کرد/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "خدمت و تداوم: قبل ۳، بعد ۲" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /مقایسه‌ی نسخه‌ها/ }).getAttribute("href")).toMatch(
      /compare\/?\?ids=31,32,33,34$/,
    );
    await expectNoAxeViolations(container);
  });

  it("records the owner's decision with a corrective action", async () => {
    const user = userEvent.setup();
    const recorded = sheet({
      decision: {
        ...sheet().decision!,
        can_decide: false,
        can_ask: false,
        corrective: null,
        last: { label: "ادامه‌ی اصلاح", by: "حسین نوری", on: "۱۴۰۵/۰۸/۲۵", note: "رفع شکاف", next: null },
      },
      result: { corrective: 1 },
    });
    const api = mockApi({ "GET actions/plans/7/post-action/": sheet(), "POST actions/plans/7/post-action/": recorded });
    render();

    expect(await screen.findByRole("radio", { name: /پایش فعال/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /ایجاد اقدام اصلاحی/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /ادامه‌ی اصلاح/ }));
    await user.click(screen.getByRole("button", { name: "ثبت تصمیم" }));

    expect(api.callsTo("POST actions/plans/7/post-action/")[0]?.body).toEqual({
      decision: "continue",
      corrective: true,
    });
    expect(await screen.findByText("رفع شکاف")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ثبت تصمیم" })).not.toBeInTheDocument();
  });

  it("asks the owner for the decision", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      "GET actions/plans/7/post-action/": sheet(),
      "POST actions/plans/7/post-action/": sheet({ result: { asked: true } }),
    });
    render();

    await user.click(await screen.findByRole("button", { name: /ارسال برای تصمیم مالک/ }));
    expect(api.callsTo("POST actions/plans/7/post-action/")[0]?.body).toEqual({ ask: true });
    expect(await screen.findByText("درخواست تصمیم برای حسین نوری فرستاده شد")).toBeInTheDocument();
  });

  it("waits for the new current assessment", async () => {
    mockApi({
      "GET actions/plans/7/post-action/": sheet({
        status: null,
        cards: sheet().cards.slice(0, 3),
        compare_href: null,
        waiting: "ارزیابی جاری تازه‌ی پس از اقدام هنوز تأیید نشده است",
        summary: null,
        paths: null,
        profile: null,
        decision: null,
        evidence: [],
      }),
    });
    render();

    expect(await screen.findByText(/هنوز تأیید نشده است/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "جاری جدید" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ارسال برای تصمیم مالک/ })).not.toBeInTheDocument();
  });

  it("shows an error state", async () => {
    mockApi({ "GET actions/plans/7/post-action/": reply(404, { detail: "پیدا نشد" }) });
    render();
    expect(await screen.findByRole("button", { name: /دوباره امتحان کنید/ })).toBeInTheDocument();
  });

  it("highlights the target risks list in the sidebar", () => {
    const navigation = session().navigation;
    expect(activeRoute("/actions/plans/7/reassess", navigation)).toBe("/treatment/targets");
    expect(activeRoute("/actions/plans/7", navigation)).toBe("/treatment/board");
  });
});
