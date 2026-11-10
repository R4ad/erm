import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { deferred, mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { riskQuestions } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { RiskQuestionsPage } from "./RiskQuestionsPage";

const route = { path: "/questionnaires/risk-questions" };

function cards() {
  return within(screen.getByRole("list", { name: "پرسش‌های باز" }))
    .getAllByRole("listitem")
    .filter((item) => !item.hidden);
}

describe("RiskQuestionsPage", () => {
  it("lists open questions with their risk and deadline", async () => {
    mockApi({ "GET risk-questions/": riskQuestions() });
    renderPage(<RiskQuestionsPage />, route);
    expect(await screen.findByRole("heading", { name: "پرسش‌های ریسک", level: 1 })).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
    expect(screen.getByText("۲ پرسش باز")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "RK-1405-0003" })[0]).toHaveAttribute("href", "/risks/3");
    await expectNoAxeViolations();
  });

  it("needs an answer before sending", async () => {
    const api = mockApi({ "GET risk-questions/": riskQuestions() });
    const { user } = renderPage(<RiskQuestionsPage />, route);
    const [first] = await screen.findAllByRole("button", { name: "ثبت جواب" });
    await user.click(first!);
    expect(await screen.findByText("جواب را بنویسید.")).toBeInTheDocument();
    expect(api.callsTo("POST risk-questions/4/answer/")).toHaveLength(0);
  });

  it("removes the card at once, moves focus to the next answer and confirms", async () => {
    const pending = deferred();
    const api = mockApi({
      "GET risk-questions/": riskQuestions(),
      "POST risk-questions/4/answer/": () => pending.promise,
    });
    const { user } = renderPage(<RiskQuestionsPage />, route);
    const [first, second] = await screen.findAllByLabelText(/پرسش آزمون/);
    await user.type(first!, "  تیم پایش شبکه  ");
    await user.click(screen.getAllByRole("button", { name: "ثبت جواب" })[0]!);

    // پیش از جواب سرور، کارت کنار رفته و فوکوس روی جواب پرسش بعدی است.
    await waitFor(() => expect(cards()).toHaveLength(1));
    await waitFor(() => expect(second).toHaveFocus());
    expect(api.callsTo("POST risk-questions/4/answer/")[0]?.body).toEqual({ answer: "تیم پایش شبکه" });

    pending.resolve({ message: "جواب ثبت شد." });
    expect(await screen.findByText("جواب ثبت شد.")).toBeInTheDocument();
  });

  it("brings the card back with the server's error when the answer is refused", async () => {
    mockApi({
      "GET risk-questions/": riskQuestions(),
      "POST risk-questions/4/answer/": reply(400, { errors: { answer: ["این پرسش دیگر باز نیست."] } }),
    });
    const { user } = renderPage(<RiskQuestionsPage />, route);
    const [first] = await screen.findAllByLabelText(/پرسش آزمون/);
    await user.type(first!, "جواب");
    await user.click(screen.getAllByRole("button", { name: "ثبت جواب" })[0]!);
    expect(await screen.findByText("این پرسش دیگر باز نیست.")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
    expect(first).toHaveValue("جواب");
    expect(first).toHaveAttribute("aria-invalid", "true");
  });

  it("says so when nothing is waiting", async () => {
    mockApi({ "GET risk-questions/": { questions: [] } });
    renderPage(<RiskQuestionsPage />, route);
    expect(await screen.findByText("پرسش بازی منتظر جواب شما نیست")).toBeInTheDocument();
  });
});
