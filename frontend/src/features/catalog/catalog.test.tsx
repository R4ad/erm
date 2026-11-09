import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UnitListPage } from "@/features/organization/UnitListPage";
import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  assetDetail,
  assetList,
  commitmentList,
  customerList,
  serviceDetail,
  serviceDetailForOwner,
  serviceList,
  supplierDetail,
  unitList,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { AssetListPage, CommitmentListPage, CustomerListPage, ServiceListPage } from "./ListPages";
import { AssetDetailPage, SupplierDetailPage } from "./RecordPages";
import { ServiceDetailPage } from "./ServiceDetailPage";

// کاتالوگ و ساختار سازمانی: همه از پل جنگو می‌خوانند و هر دکمه همان است که جنگو به همین کاربر می‌دهد.

function pageAt(djangoPath: string, data: unknown) {
  return mockApi({
    "GET pages/": (call: ApiCall) => (call.query.get("path")?.split("?")[0] === djangoPath ? data : reply(404, {})),
  });
}

describe("catalog lists", () => {
  it("lists services with their unit, owner and stage, and the button to add one", async () => {
    pageAt("/catalog/services/", serviceList());
    renderPage(<ServiceListPage />, { path: "/catalog/services" });
    const table = await screen.findByRole("table", { name: /خدمت‌ها/ });
    const row = within(table).getByRole("link", { name: "درگاه پرداخت اینترنتی" }).closest("tr")!;
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/catalog/services/1");
    expect(row).toHaveTextContent("SRV-PAY");
    expect(row).toHaveTextContent("حیاتی");
    expect(row).toHaveTextContent("مدیریت عملیات");
    expect(row).toHaveTextContent("مینا خدمتی");
    expect(row).toHaveTextContent("بهره‌برداری");
    const retired = within(table).getByRole("link", { name: "پیامک بانکی" }).closest("tr")!;
    expect(retired).toHaveTextContent("غیرفعال");
    expect(screen.getByRole("link", { name: "خدمت تازه" })).toHaveAttribute("href", "/catalog/services/new");
    expect(screen.getByRole("search", { name: "فیلتر خدمت‌ها" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows banks with the financial basis in local digits and a named edit link", async () => {
    pageAt("/catalog/customers/", customerList());
    renderPage(<CustomerListPage />, { path: "/catalog/customers" });
    const table = await screen.findByRole("table", { name: /بانک‌ها/ });
    const row = within(table).getByText("بانک ملی").closest("tr")!;
    expect(row).toHaveTextContent("کلیدی");
    expect(row).toHaveTextContent("۱۲۰٬۰۰۰٬۰۰۰٬۰۰۰");
    expect(within(row).getByRole("link", { name: "ویرایش بانک ملی" })).toHaveAttribute(
      "href",
      "/catalog/customers/1/edit",
    );
    await expectNoAxeViolations();
  });

  it("hides the add and edit buttons from someone who may only read", async () => {
    const data = customerList({ create_url: null });
    pageAt("/catalog/customers/", { ...data, results: data.results.map((row) => ({ ...row, edit_url: null })) });
    renderPage(<CustomerListPage />, { path: "/catalog/customers" });
    await screen.findByRole("table", { name: /بانک‌ها/ });
    expect(screen.queryByRole("link", { name: /ویرایش/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "بانک تازه" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "کارها" })).not.toBeInTheDocument();
  });

  it("shows commitments with the services the user sees and their validity", async () => {
    const data = commitmentList();
    pageAt("/catalog/commitments/", {
      ...data,
      results: [...data.results, { ...data.results[0]!, id: 2, title: "پاسخ به رخداد", customer: null, services: [] }],
    });
    renderPage(<CommitmentListPage />, { path: "/catalog/commitments" });
    const table = await screen.findByRole("table", { name: /تعهدها/ });
    const row = within(table).getByText("دسترس‌پذیری ۹۹٫۹ درصد ماهانه").closest("tr")!;
    expect(within(row).getByRole("link", { name: "SRV-PAY" })).toHaveAttribute("href", "/catalog/services/1");
    expect(row).toHaveTextContent("از ۱۴۰۴/۰۱/۰۱");
    expect(row).toHaveTextContent("تا ۱۴۰۴/۱۲/۲۹");
    expect(row).toHaveTextContent("منقضی");
    const general = within(table).getByText("پاسخ به رخداد").closest("tr")!;
    expect(general).toHaveTextContent("همه");
    await expectNoAxeViolations();
  });

  it("names each CIA letter for screen readers", async () => {
    pageAt("/catalog/assets/", assetList());
    renderPage(<AssetListPage />, { path: "/catalog/assets" });
    const table = await screen.findByRole("table", { name: /دارایی‌ها/ });
    const row = within(table).getByRole("link", { name: "پایگاه داده‌ی پرداخت" }).closest("tr")!;
    expect(row).toHaveTextContent("C (محرمانگی)");
    expect(row).toHaveTextContent("A (دسترس‌پذیری)");
    expect(row).toHaveTextContent("محرمانه");
    await expectNoAxeViolations();
  });
});

describe("ServiceDetailPage", () => {
  it("shows commitments, dependencies with their boundary, banks, coverage and risks", async () => {
    pageAt("/catalog/services/1/", serviceDetail());
    const { user } = renderPage(<ServiceDetailPage />, { path: "/catalog/services/1", route: "/catalog/services/:pk" });
    expect(await screen.findByRole("heading", { name: "درگاه پرداخت اینترنتی", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ویرایش" })).toHaveAttribute("href", "/catalog/services/1/edit");

    const commitments = screen.getByRole("table", { name: "تعهدهای این خدمت" });
    expect(commitments).toHaveTextContent("منقضی");
    expect(within(commitments).getByRole("link", { name: /ویرایش دسترس‌پذیری/ })).toHaveAttribute(
      "href",
      "/catalog/commitments/1/edit?service=1",
    );
    expect(screen.getByRole("link", { name: "افزودن تعهد" })).toHaveAttribute(
      "href",
      "/catalog/commitments/new?service=1",
    );

    const dependencies = screen.getByRole("table", { name: /وابستگی‌های این خدمت/ });
    const network = within(dependencies).getByRole("link", { name: "شرکت ارتباطات زیرساخت" }).closest("tr")!;
    expect(within(network).getByRole("link", { name: "شرکت ارتباطات زیرساخت" })).toHaveAttribute(
      "href",
      "/catalog/suppliers/1",
    );
    expect(network).toHaveTextContent("نقطه‌ی شکست مشترک");
    expect(network).toHaveTextContent("جایگزین: لینک پشتیبان از تأمین‌کننده‌ی دوم");
    expect(network).toHaveTextContent("مالک زیرساخت");
    expect(network).toHaveTextContent("مرکز عملیات شبکه‌ی تأمین‌کننده");
    const core = within(dependencies).getByRole("link", { name: "SRV-CORE - هسته‌ی بانکی" }).closest("tr")!;
    expect(core).toHaveTextContent("ثبت نشده");

    await user.click(screen.getByRole("button", { name: "افزودن وابستگی" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "به تأمین‌کننده" })).toHaveAttribute(
      "href",
      "/catalog/services/1/dependencies/new/supplier",
    );
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
    await user.keyboard("{Escape}");

    const banks = screen.getByRole("table", { name: /بانک‌های این خدمت/ });
    const bank = within(banks).getByText("بانک ملی").closest("tr")!;
    expect(bank).toHaveTextContent("۴ ساعت");
    expect(bank).toHaveTextContent("۱ روز");
    expect(bank).toHaveTextContent("۱۵ دقیقه");
    expect(bank).toHaveTextContent("BIA-1404-07");

    const coverage = screen.getByRole("list", { name: /پوشش این خدمت/ });
    const relevant = within(coverage).getByText("نرم‌افزار و توسعه").closest("li")!;
    expect(relevant).toHaveTextContent("نامرتبط");
    expect(within(relevant).getByRole("link")).toHaveAttribute(
      "href",
      "/risks/coverage/1/2?next=%2Fcatalog%2Fservices%2F1%2F",
    );
    expect(screen.getByRole("link", { name: "جدول پوشش" })).toHaveAttribute("href", "/risks/coverage?q=SRV-PAY");
    expect(screen.getByRole("link", { name: "انتخاب سناریو برای ثبت ریسک" })).toHaveAttribute(
      "href",
      "/risks/scenarios",
    );
    expect(screen.getByText("ریسکی برای این خدمت که شما ببینید ثبت نشده است.")).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("gives an owner no edit buttons and no link to a service they cannot see", async () => {
    pageAt("/catalog/services/1/", serviceDetailForOwner());
    renderPage(<ServiceDetailPage />, { path: "/catalog/services/1", route: "/catalog/services/:pk" });
    await screen.findByRole("heading", { name: "درگاه پرداخت اینترنتی", level: 1 });
    expect(screen.queryByRole("link", { name: /ویرایش/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "افزودن وابستگی" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /افزودن/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "انتخاب سناریو برای ثبت ریسک" })).not.toBeInTheDocument();
    const dependencies = screen.getByRole("table", { name: /وابستگی‌های این خدمت/ });
    expect(within(dependencies).getByText("SRV-CORE - هسته‌ی بانکی").closest("a")).toBeNull();
  });

  it("drops the coverage section for an inactive service", async () => {
    pageAt("/catalog/services/1/", serviceDetail({ coverage: null }));
    renderPage(<ServiceDetailPage />, { path: "/catalog/services/1", route: "/catalog/services/:pk" });
    await screen.findByRole("heading", { name: "درگاه پرداخت اینترنتی", level: 1 });
    expect(screen.queryByRole("heading", { name: "پوشش جهان ریسک" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "پوشش جهان ریسک" })).not.toBeInTheDocument();
  });

  it("shows the error with the page header when Django refuses the service", async () => {
    mockApi({ "GET pages/": reply(404, { message: "صفحه پیدا نشد." }) });
    renderPage(<ServiceDetailPage />, { path: "/catalog/services/9", route: "/catalog/services/:pk" });
    expect(await screen.findByRole("heading", { name: "خدمت", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("supplier and asset pages", () => {
  it("lists the services that depend on a supplier", async () => {
    pageAt("/catalog/suppliers/1/", supplierDetail());
    renderPage(<SupplierDetailPage />, { path: "/catalog/suppliers/1", route: "/catalog/suppliers/:pk" });
    expect(await screen.findByRole("heading", { name: "شرکت ارتباطات زیرساخت", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "مشخصات تأمین‌کننده" })).toHaveTextContent("سارا احمدی");
    const table = screen.getByRole("table", { name: /وابسته‌اند/ });
    const row = within(table).getByRole("link", { name: "SRV-PAY" }).closest("tr")!;
    expect(row).toHaveTextContent("حیاتی");
    expect(row).toHaveTextContent("نقطه‌ی شکست مشترک");
    expect(screen.getByRole("link", { name: "ویرایش" })).toHaveAttribute("href", "/catalog/suppliers/1/edit");
    await expectNoAxeViolations();
  });

  it("says so when no visible service depends on an asset", async () => {
    pageAt("/catalog/assets/1/", assetDetail({ dependents: [], edit_url: null }));
    renderPage(<AssetDetailPage />, { path: "/catalog/assets/1", route: "/catalog/assets/:pk" });
    expect(await screen.findByRole("heading", { name: "پایگاه داده‌ی پرداخت", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("هیچ خدمتی از خدمت‌هایی که می‌بینید به این وابسته نیست.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ویرایش" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "مشخصات دارایی" })).toHaveTextContent("I (صحت)");
    await expectNoAxeViolations();
  });
});

describe("UnitListPage", () => {
  it("shows the units as a tree with each unit's parent for screen readers", async () => {
    pageAt("/units/", unitList());
    renderPage(<UnitListPage />, { path: "/units" });
    const table = await screen.findByRole("table", { name: /واحدهای سازمان به ترتیب درخت/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
      "معاونت فناوری",
      "امنیت اطلاعات، زیرمجموعه‌ی معاونت فناوری",
      "مدیریت عملیات، زیرمجموعه‌ی معاونت فناوری",
      "مرکز داده، زیرمجموعه‌ی مدیریت عملیات",
    ]);
    expect(rows[2]).toHaveTextContent("مینا خدمتی");
    expect(within(rows[3]!).getByRole("link", { name: "ویرایش مرکز داده" })).toHaveAttribute("href", "/units/3/edit");
    expect(screen.getByRole("link", { name: "واحد تازه" })).toHaveAttribute("href", "/units/new");
    await expectNoAxeViolations();
  });
});
