import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { activeRoute } from "@/components/layout/nav";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { postAction, session } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { PostActionPage } from "./PostActionPage";

function render() {
  return renderPage(<PostActionPage />, {
    path: "/actions/plans/7/reassess",
    route: "/actions/plans/:plan_pk/reassess",
  });
}

describe("PostActionPage", () => {
  it("compares the four assessments and shows paths, the impact profile and the outcome", async () => {
    mockApi({ "GET actions/plans/7/post-action/": postAction() });
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
    const recorded = postAction({
      decision: {
        ...postAction().decision!,
        can_decide: false,
        can_ask: false,
        corrective: null,
        last: { label: "ادامه‌ی اصلاح", by: "حسین نوری", on: "۱۴۰۵/۰۸/۲۵", note: "رفع شکاف", next: null },
      },
      result: { corrective: 1 },
    });
    const api = mockApi({
      "GET actions/plans/7/post-action/": postAction(),
      "POST actions/plans/7/post-action/": recorded,
    });
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
      "GET actions/plans/7/post-action/": postAction(),
      "POST actions/plans/7/post-action/": postAction({ result: { asked: true } }),
    });
    render();

    await user.click(await screen.findByRole("button", { name: /ارسال برای تصمیم مالک/ }));
    expect(api.callsTo("POST actions/plans/7/post-action/")[0]?.body).toEqual({ ask: true });
    expect(await screen.findByText("درخواست تصمیم برای حسین نوری فرستاده شد")).toBeInTheDocument();
  });

  it("waits for the new current assessment", async () => {
    mockApi({
      "GET actions/plans/7/post-action/": postAction({
        status: null,
        cards: postAction().cards.slice(0, 3),
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
