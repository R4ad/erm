import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChangeRequestDetailPage } from "@/features/change-requests/ChangeRequestPages";
import { CoveragePage } from "@/features/coverage/CoveragePage";
import { EvidenceDetailPage, EvidenceListPage } from "@/features/evidence/EvidencePages";
import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { changeDetail, coverage, evidenceDetail, evidenceList } from "@/test/fixtures";
import { renderPage } from "@/test/render";

// صفحه‌های خواندنی که از پل جنگو (/api/pages/) می‌آیند: فیلترهای همگام با نشانی، جدول‌ها و کارهای روی پرونده.

const location = () => screen.getByTestId("location").textContent;

/** سرور آزمون شواهد: همان فیلترهای فرم جنگو را روی نشانی خواسته‌شده اعمال می‌کند. */
function evidencePages(call: ApiCall) {
  const url = new URL(call.query.get("path")!, window.location.origin);
  const page = evidenceList();
  const kind = url.searchParams.get("kind");
  const q = url.searchParams.get("q");
  page.results = page.results.filter((row) => (!kind || row.kind.value === kind) && (!q || row.title.includes(q)));
  page.count = page.results.length;
  return page;
}

describe("evidence list", () => {
  it("shows the register and keeps its filters in the page address", async () => {
    const api = mockApi({ "GET pages/": evidencePages });
    const { user } = renderPage(<EvidenceListPage />, { path: "/risks/evidence" });
    const table = await screen.findByRole("table", { name: "شواهد" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("link", { name: "شاهد آزمون 1" })).toHaveAttribute("href", "/risks/evidence/1");
    expect(within(table).getByText("محرمانه")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شاهد تازه" })).toHaveAttribute("href", "/risks/evidence/new");
    expect(api.calls[0]!.query.get("path")).toBe("/risks/evidence/");
    await expectNoAxeViolations();

    await user.selectOptions(screen.getByRole("combobox", { name: "نوع" }), "test");
    expect(location()).toBe("/risks/evidence?kind=test");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
    expect(api.calls.at(-1)!.query.get("path")).toBe("/risks/evidence/?kind=test");

    await user.click(screen.getByRole("button", { name: "برداشتن فیلتر نوع: آزمون" }));
    expect(location()).toBe("/risks/evidence");
  });

  it("searches after typing stops and offers to clear filters when nothing matches", async () => {
    mockApi({ "GET pages/": evidencePages });
    const { user } = renderPage(<EvidenceListPage />, { path: "/risks/evidence?kind=incident" });
    await screen.findByRole("table", { name: "شواهد" });
    expect(screen.getByRole("combobox", { name: "نوع" })).toHaveValue("incident");

    await user.type(screen.getByRole("searchbox", { name: "جست‌وجو" }), "ناموجود");
    await waitFor(() =>
      expect(location()).toBe("/risks/evidence?kind=incident&q=%D9%86%D8%A7%D9%85%D9%88%D8%AC%D9%88%D8%AF"),
    );
    expect(await screen.findByRole("heading", { name: "شاهدی با این فیلترها پیدا نشد" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "پاک کردن فیلترها" }));
    expect(location()).toBe("/risks/evidence");
    expect(await screen.findByRole("table", { name: "شواهد" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "جست‌وجو" })).toHaveValue("");
  });
});

describe("evidence dossier", () => {
  it("shows the evidence, its risks, attachments and comments, and posts a new comment", async () => {
    const detail = evidenceDetail();
    const api = mockApi({
      "GET pages/": () => detail,
      "POST forms/": (call: ApiCall) => {
        detail.comments.push({
          id: 6,
          text: (call.body as { values: { text: string } }).values.text,
          by: { id: 3, name: "کاربر آزمون" },
          at: { iso: "2026-11-04T08:00:00+00:00", jalali: "1405/08/13 11:30" },
          edited: false,
          edit_url: "/comments/6/edit/",
        });
        return { message: "نظر ثبت شد.", redirect: { href: "/risks/evidence/1/", route: "/risks/evidence/1" } };
      },
    });
    const { user } = renderPage(<EvidenceDetailPage />, { path: "/risks/evidence/1" });
    expect(await screen.findByRole("heading", { name: /شاهد آزمون 1/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ریسک آزمون شماره‌ی 1/ })).toHaveAttribute("href", "/risks/1");
    expect(screen.getByRole("link", { name: "افزودن پیوست" })).toHaveAttribute("href", "/attachments/31/1/new");
    expect(screen.getByRole("heading", { name: "نظرها" })).toBeInTheDocument();
    const comment = screen.getByText("نظر آزمون روی شاهد").closest("li")!;
    expect(comment).toHaveTextContent(/کاربر آزمون، .*، ویرایش‌شده/);
    expect(within(comment).getByRole("link", { name: "ویرایش" })).toHaveAttribute("href", "/comments/5/edit");
    await expectNoAxeViolations();

    const box = screen.getByRole("textbox", { name: "نظر تازه" });
    await user.click(screen.getByRole("button", { name: "ثبت نظر" }));
    expect(box).toHaveAccessibleDescription("نظر خالی ثبت نمی‌شود.");
    expect(api.callsTo("POST forms/")).toHaveLength(0);

    await user.type(box, "نظر تازه‌ی آزمون");
    await user.click(screen.getByRole("button", { name: "ثبت نظر" }));
    expect(await screen.findByText("نظر تازه‌ی آزمون", { selector: "p" })).toBeInTheDocument();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/comments/31/1/new/");
    expect(call!.body).toEqual({ values: { text: "نظر تازه‌ی آزمون" } });
    expect(box).toHaveValue("");
    expect(screen.getByText("نظر ثبت شد.")).toBeInTheDocument();
  });
});

describe("risk universe", () => {
  it("shows the counts, the tabs and a chip per cell with its coverage (Figma 09)", async () => {
    mockApi({ "GET pages/": coverage() });
    renderPage(<CoveragePage />, { path: "/risks/coverage" });
    const table = await screen.findByRole("table", { name: "پوشش خدمت‌ها در دسته‌های ریسک" });
    expect(screen.getByText("۱ خدمت دست‌کم یک خانه‌ی باز دارند")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /همه‌ی خدمات/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "خروجی Excel" })).toHaveAttribute("href", "/api/risks/coverage/export/");
    const row = within(table)
      .getByRole("rowheader", { name: /خدمت آزمون/ })
      .closest("tr")!;
    expect(within(row).getByRole("button", { name: "خدمت آزمون × T1 دسته‌ی آزمون: ۲ ریسک" })).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "خدمت آزمون × T2 دسته‌ی آزمون دوم: در انتظار" }),
    ).toBeInTheDocument();
    expect(row).toHaveTextContent("۱ از ۲");
    expect(screen.getByText("نمایش ۱ از ۱ خدمت · خدمت غیرفعال در جدول نمی‌آید")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /نمایش بیشتر/ })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("opens a pending cell and marks it reviewed without a risk", async () => {
    const api = mockApi({
      "GET pages/": coverage(),
      "POST forms/": { message: "وضعیت ثبت شد.", redirect: { href: "/risks/coverage/", route: "/risks/coverage" } },
    });
    const { user } = renderPage(<CoveragePage />, { path: "/risks/coverage" });
    await user.click(await screen.findByRole("button", { name: /× T2 دسته‌ی آزمون دوم: در انتظار/ }));
    const card = await screen.findByRole("dialog", { name: "خدمت آزمون × T2 دسته‌ی آزمون دوم" });
    expect(card).toHaveTextContent("این خانه هنوز بررسی نشده است.");
    expect(within(card).getByRole("link", { name: "ثبت ریسک برای این خانه" })).toHaveAttribute(
      "href",
      "/risks/scenarios?service=1&category=2",
    );
    await user.click(within(card).getByRole("button", { name: "بررسی‌شده، بدون ریسک" }));
    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    const call = api.callsTo("POST forms/")[0]!;
    expect(call.query.get("path")).toBe("/risks/coverage/1/2/?next=%2Frisks%2Fcoverage%2F");
    expect(call.body).toEqual({ values: { status: "reviewed", reason: "" } });
  });

  it("needs a reason before a cell is marked not relevant", async () => {
    const api = mockApi({
      "GET pages/": coverage(),
      "POST forms/": { message: "وضعیت ثبت شد.", redirect: { href: "/risks/coverage/", route: "/risks/coverage" } },
    });
    const { user } = renderPage(<CoveragePage />, { path: "/risks/coverage" });
    await user.click(await screen.findByRole("button", { name: /× T2 دسته‌ی آزمون دوم: در انتظار/ }));
    const card = await screen.findByRole("dialog", { name: "خدمت آزمون × T2 دسته‌ی آزمون دوم" });
    await user.click(within(card).getByRole("button", { name: "نامرتبط با دلیل" }));
    await user.click(within(card).getByRole("button", { name: "ثبت «نامرتبط»" }));
    expect(card).toHaveTextContent("بنویسید چرا این دسته به این خدمت مربوط نیست.");
    expect(api.callsTo("POST forms/")).toHaveLength(0);
    await user.type(within(card).getByRole("textbox", { name: /دلیل نامرتبط بودن/ }), "داده‌ی مشتری ندارد");
    await user.click(within(card).getByRole("button", { name: "ثبت «نامرتبط»" }));
    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    expect(api.callsTo("POST forms/")[0]!.body).toEqual({
      values: { status: "not_relevant", reason: "داده‌ی مشتری ندارد" },
    });
  });

  it("does not offer not-relevant for a cell that has active risks", async () => {
    mockApi({ "GET pages/": coverage() });
    const { user } = renderPage(<CoveragePage />, { path: "/risks/coverage" });
    await user.click(await screen.findByRole("button", { name: /× T1 دسته‌ی آزمون: ۲ ریسک/ }));
    const card = await screen.findByRole("dialog", { name: "خدمت آزمون × T1 دسته‌ی آزمون" });
    expect(card).toHaveTextContent("۲ ریسک فعال در این خانه ثبت شده است.");
    expect(within(card).getByRole("link", { name: "مشاهده‌ی ریسک‌های این خانه" })).toHaveAttribute(
      "href",
      "/risks?service=1&category=1",
    );
    expect(within(card).queryByRole("button", { name: "نامرتبط با دلیل" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "بررسی‌شده، بدون ریسک" })).not.toBeInTheDocument();
  });
});

describe("merge and split requests", () => {
  const decided = {
    message: "پیشنهاد رد شد.",
    redirect: { href: "/workflow/requests/7/", route: "/workflow/requests/7" },
  };

  it("needs a reason to reject and sends it with the decision", async () => {
    const api = mockApi({ "GET pages/": changeDetail(), "POST forms/": decided });
    const { user } = renderPage(<ChangeRequestDetailPage />, { path: "/workflow/requests/7" });
    expect(await screen.findByText("دلیل آزمونی ادغام.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /RK-1405-0002/ })).toHaveAttribute("href", "/risks/2");
    await expectNoAxeViolations();

    const note = screen.getByRole("textbox", { name: "توضیح" });
    await user.click(screen.getByRole("button", { name: "رد" }));
    expect(note).toHaveAccessibleDescription(/دلیل رد را بنویسید/);
    expect(note).toHaveFocus();
    expect(api.callsTo("POST forms/")).toHaveLength(0);

    await user.type(note, "هم‌پوشانی ندارند.");
    await user.click(screen.getByRole("button", { name: "رد" }));
    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/workflow/requests/7/");
    expect(call!.body).toEqual({ values: { decision: "reject", note: "هم‌پوشانی ندارند." } });
    expect(await screen.findByText("پیشنهاد رد شد.")).toBeInTheDocument();
  });

  it("confirms an approval first and shows Django's refusal if the risk changed meanwhile", async () => {
    const refused = reply(400, { message: "فرم درست نیست.", errors: { __all__: ["ریسک دیگر در این وضعیت نیست."] } });
    const api = mockApi({ "GET pages/": changeDetail(), "POST forms/": refused });
    const { user } = renderPage(<ChangeRequestDetailPage />, { path: "/workflow/requests/7" });
    await user.click(await screen.findByRole("button", { name: "تأیید" }));
    const dialog = await screen.findByRole("alertdialog", { name: "ادغام ریسک RK-1405-0001 تأیید شود؟" });
    expect(dialog).toHaveTextContent("بسته‌شده");
    expect(api.callsTo("POST forms/")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "تأیید" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ریسک دیگر در این وضعیت نیست.");
    expect(api.callsTo("POST forms/")[0]!.body).toEqual({ values: { decision: "approve", note: "" } });
  });

  it("shows no decision card to someone who cannot decide", async () => {
    mockApi({ "GET pages/": changeDetail(false) });
    renderPage(<ChangeRequestDetailPage />, { path: "/workflow/requests/7" });
    expect(await screen.findByText("دلیل آزمونی ادغام.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تأیید" })).not.toBeInTheDocument();
  });
});
