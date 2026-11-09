import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormPage } from "@/features/forms/FormPage";
import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  controlAssessmentDetail,
  controlAssessmentForm,
  controlDetail,
  controlList,
  soaDetail,
  soaGapDetail,
  soaList,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ControlAssessmentDetailPage, ControlDetailPage, ControlListPage } from "./ControlPages";
import { SoaDetailPage, SoaListPage } from "./SoaPages";

// کتابخانه‌ی کنترل، ارزیابی اثربخشی و بیانیه‌ی کاربردپذیری: همه از پل جنگو می‌خوانند و هر دکمه همان است که
// جنگو به همین کاربر می‌دهد.

function pageAt(djangoPath: string, data: unknown) {
  return mockApi({
    "GET pages/": (call: ApiCall) => (call.query.get("path")?.split("?")[0] === djangoPath ? data : reply(404, {})),
  });
}

describe("ControlListPage", () => {
  it("lists the controls with kind, owner, Annex A mappings and the GRC buttons", async () => {
    pageAt("/controls/", controlList());
    renderPage(<ControlListPage />, { path: "/controls" });
    const table = await screen.findByRole("table", { name: /کنترل‌ها/ });
    const row = within(table).getByRole("link", { name: "احراز هویت چندعاملی برای حساب‌های ممتاز" }).closest("tr")!;
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/controls/1");
    expect(row).toHaveTextContent("پیشگیرانه");
    expect(row).toHaveTextContent("کلیدی");
    expect(row).toHaveTextContent("مینا کنترلی");
    expect(within(row).getByText("5.15")).toBeInTheDocument();
    expect(within(row).getByText("8.5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "کنترل تازه" })).toHaveAttribute("href", "/controls/new");
    expect(screen.getByRole("link", { name: "بیانیه‌ی کاربردپذیری" })).toHaveAttribute("href", "/controls/soa");
    expect(screen.getByRole("search", { name: "فیلتر کنترل‌ها" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows neither button to a control owner", async () => {
    pageAt("/controls/", controlList({ create_url: null, soa_url: null }));
    renderPage(<ControlListPage />, { path: "/controls" });
    await screen.findByRole("table", { name: /کنترل‌ها/ });
    expect(screen.queryByRole("link", { name: "کنترل تازه" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "بیانیه‌ی کاربردپذیری" })).not.toBeInTheDocument();
  });
});

describe("ControlDetailPage", () => {
  it("shows effectiveness with the reason a test gives no credit, the Annex A rows and the risks", async () => {
    pageAt("/controls/1/", controlDetail());
    renderPage(<ControlDetailPage />, { path: "/controls/1", route: "/controls/:pk" });
    expect(
      await screen.findByRole("heading", { name: "احراز هویت چندعاملی برای حساب‌های ممتاز", level: 1 }),
    ).toBeInTheDocument();

    const effect = screen.getByRole("table", { name: /ارزیابی‌های اثربخشی/ });
    const stale = within(effect).getByRole("link", { name: "CA-1405-0002" }).closest("tr")!;
    expect(stale).toHaveTextContent("E۳");
    expect(stale).toHaveTextContent("شاهدش از ۱۴۰۳/۰۱/۱۲ کهنه شده است؛ در Bc فقط E۱ حساب می‌شود");
    const good = within(effect).getByRole("link", { name: "CA-1405-0001" }).closest("tr")!;
    expect(good).toHaveTextContent("E۴");
    expect(good).not.toHaveTextContent("در Bc");
    expect(within(effect).getByRole("link", { name: "CA-1405-0001" })).toHaveAttribute(
      "href",
      "/controls/effectiveness/1",
    );
    expect(screen.getByRole("link", { name: "ارزیابی اثربخشی تازه" })).toHaveAttribute(
      "href",
      "/controls/1/effectiveness/new",
    );

    const annex = screen.getByRole("table", { name: /کنترل‌های پیوست A/ });
    const mapped = within(annex).getByRole("link", { name: "کنترل دسترسی" }).closest("tr")!;
    expect(within(annex).getByRole("link", { name: "کنترل دسترسی" })).toHaveAttribute("href", "/controls/soa/15");
    expect(mapped).toHaveTextContent("کاربرد دارد");
    expect(mapped).toHaveTextContent("اجراشده");
    expect(within(annex).getByText("احراز هویت امن").closest("tr")).toHaveTextContent("تعیین‌نشده");

    expect(screen.getByRole("table", { name: "ریسک‌هایی که به این کنترل تکیه دارند" })).toBeInTheDocument();
    const facts = screen.getByRole("complementary", { name: "مشخصات کنترل" });
    expect(facts).toHaveTextContent("داتین");
    expect(within(facts).getByText("کنترل کلیدی").nextElementSibling).toHaveTextContent("بله");
    expect(screen.getByRole("link", { name: "ویرایش" })).toHaveAttribute("href", "/controls/1/edit");
    await expectNoAxeViolations();
  });

  it("gives the control owner no edit or E buttons and no Annex A links", async () => {
    pageAt(
      "/controls/1/",
      controlDetail({
        edit_url: null,
        add_assessment_url: null,
        iso_controls: controlDetail().iso_controls.map((iso) => ({ ...iso, href: null })),
      }),
    );
    renderPage(<ControlDetailPage />, { path: "/controls/1", route: "/controls/:pk" });
    const annex = await screen.findByRole("table", { name: /کنترل‌های پیوست A/ });
    expect(within(annex).queryByRole("link")).not.toBeInTheDocument();
    expect(within(annex).getByText("کنترل دسترسی")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ویرایش" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ارزیابی اثربخشی تازه" })).not.toBeInTheDocument();
  });
});

describe("ControlAssessmentDetailPage", () => {
  it("shows the test sheet and warns when its data no longer supports the recorded E", async () => {
    pageAt("/controls/effectiveness/3/", controlAssessmentDetail());
    renderPage(<ControlAssessmentDetailPage />, {
      path: "/controls/effectiveness/3",
      route: "/controls/effectiveness/:pk",
    });
    expect(await screen.findByRole("heading", { name: "ارزیابی اثربخشی CA-1405-0003", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("داده‌های فعلی این برگه دیگر E۳ را پشتیبانی نمی‌کنند")).toBeInTheDocument();
    expect(screen.getByText("برای E3 و بالاتر نمونه‌ی آزمون دست‌کم ۳۰ مورد است.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "بخش‌های برگه‌ی آزمون" })).toBeInTheDocument();

    const test = screen.getByRole("region", { name: "آزمون" });
    expect(test).toHaveTextContent("۱۲");
    expect(test).toHaveTextContent("عملکرد مستمر: بله");
    const result = screen.getByRole("region", { name: "نتیجه" });
    expect(result).toHaveTextContent("اثربخشی فعلی تأییدشده");
    expect(result).toHaveTextContent("سارا احمدی");
    expect(screen.getByRole("link", { name: "شاهد آزمون کنترل" })).toHaveAttribute("href", "/risks/evidence/3");
    expect(screen.getByRole("link", { name: "ورود با گذرواژه‌ی دزدیده" })).toBeInTheDocument();

    const facts = screen.getByRole("complementary", { name: "مشخصات ارزیابی" });
    expect(within(facts).getByRole("link", { name: /CT-0001/ })).toHaveAttribute("href", "/controls/1");
    expect(facts).toHaveTextContent("۹۰ روز بعد از پایان آزمون");
    expect(screen.getByRole("link", { name: "ویرایش" })).toHaveAttribute("href", "/controls/effectiveness/3/edit");
    await expectNoAxeViolations();
  });
});

describe("SoaListPage", () => {
  it("shows the summary as filter links and flags applicable rows without an organisation control", async () => {
    pageAt("/controls/soa/", soaList());
    renderPage(<SoaListPage />, { path: "/controls/soa" });
    const table = await screen.findByRole("table", { name: /کنترل‌های پیوست A/ });
    const gap = within(table).getByRole("link", { name: "خط‌مشی‌های امنیت اطلاعات" }).closest("tr")!;
    expect(gap).toHaveTextContent("Policies for information security");
    expect(gap).toHaveTextContent("برنامه‌ریزی‌شده");
    expect(gap).toHaveTextContent("بدون کنترل");
    const mapped = within(table).getByRole("link", { name: "کنترل دسترسی" }).closest("tr")!;
    expect(mapped).not.toHaveTextContent("بدون کنترل");

    const summary = screen.getByRole("navigation", { name: "خلاصه‌ی بیانیه" });
    expect(within(summary).getByRole("link", { name: /همه/ })).toHaveAttribute("aria-current", "page");
    expect(within(summary).getByRole("link", { name: /تعیین‌نشده/ })).toHaveTextContent("۹۰");
    fireEvent.click(within(summary).getByRole("link", { name: /بدون کنترل سازمان/ }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/controls/soa?state=gap"));
    expect(within(summary).getByRole("link", { name: /بدون کنترل سازمان/ })).toHaveAttribute("aria-current", "page");
    await expectNoAxeViolations();
  });
});

describe("SoaDetailPage", () => {
  it("warns when an applicable control has no organisation control and links the row form", async () => {
    pageAt("/controls/soa/1/", soaGapDetail());
    renderPage(<SoaDetailPage />, { path: "/controls/soa/1", route: "/controls/soa/:pk" });
    expect(await screen.findByRole("heading", { name: "خط‌مشی‌های امنیت اطلاعات", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/هیچ کنترل فعال سازمان/)).toBeInTheDocument();
    expect(screen.getByText("سیاست")).toBeInTheDocument();
    expect(screen.getByText("کنترل سازمانی به این کنترل نگاشت نشده است.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ویرایش" })).toHaveAttribute("href", "/controls/soa/1/edit");
    await expectNoAxeViolations();
  });

  it("lists the organisation controls of a mapped row", async () => {
    pageAt("/controls/soa/15/", soaDetail());
    renderPage(<SoaDetailPage />, { path: "/controls/soa/15", route: "/controls/soa/:pk" });
    const table = await screen.findByRole("table", { name: /کنترل‌های سازمان/ });
    expect(within(table).getByRole("link", { name: "احراز هویت چندعاملی برای حساب‌های ممتاز" })).toHaveAttribute(
      "href",
      "/controls/1",
    );
    expect(screen.queryByText(/ناهمخوانی بیانیه/)).not.toBeInTheDocument();
  });
});

describe("control test sheet", () => {
  it("puts the Django sections in named groups beside the E levels and the control card", async () => {
    mockApi({
      "GET forms/": (call: ApiCall) =>
        call.query.get("path") === "/controls/1/effectiveness/new/" ? controlAssessmentForm() : reply(404, {}),
    });
    renderPage(<FormPage />, { path: "/controls/1/effectiveness/new" });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("ارزیابی اثربخشی تازه برای CT-0001");
    const scope = screen.getByRole("group", { name: /دامنه، طراحی و پوشش/ });
    expect(within(scope).getByRole("textbox", { name: /دامنه/ })).toBeRequired();
    expect(within(scope).getByRole("checkbox", { name: /شکست یا شکاف شناخته‌شده/ })).toBeInTheDocument();
    const result = screen.getByRole("group", { name: /نتیجه/ });
    expect(within(result).getByRole("combobox", { name: /^E/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "شرط‌های E4 و E5" })).toBeInTheDocument();

    const guide = screen.getByRole("complementary", { name: "راهنمای روش" });
    expect(guide).toHaveTextContent("اثربخشی فعلی تأییدشده");
    expect(guide).toHaveTextContent("دست‌کم ۹۵ درصد");
    expect(screen.getByRole("heading", { name: "کنترل", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("پیشگیرانه، کنترل کلیدی")).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
