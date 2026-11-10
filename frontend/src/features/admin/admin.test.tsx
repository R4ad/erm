import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ApiCall } from "@/test/api";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import {
  auditChangeList,
  auditEventList,
  holidayList,
  staffImportDone,
  staffImportDryRun,
  staffImportForm,
  userList,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { AuditChangeListPage, AuditEventListPage } from "./AuditPages";
import { HolidayListPage } from "./HolidayListPage";
import { StaffImportPage } from "./StaffImportPage";
import { UserListPage } from "./UserListPage";

// مدیریت سامانه: فهرست‌ها از پل جنگو می‌خوانند و هر کار (حذف تعطیلی، بارگذاری و تأیید ورود کارکنان) همان view
// جنگوست که از راه /api/forms/ فرستاده می‌شود.

function pageAt(djangoPath: string, data: unknown) {
  return mockApi({
    "GET pages/": (call: ApiCall) => (call.query.get("path")?.split("?")[0] === djangoPath ? data : reply(404, {})),
  });
}

describe("users", () => {
  it("lists users with their roles and status, and links to the staff import", async () => {
    pageAt("/accounts/users/", userList());
    renderPage(<UserListPage />, { path: "/accounts/users" });
    const table = await screen.findByRole("table", { name: /کاربران/ });
    const first = within(table).getByText("کاربر آزمون یکم").closest("tr")!;
    expect(first).toHaveTextContent("test.one");
    expect(first).toHaveTextContent("۱۰۲۱");
    expect(first).toHaveTextContent("واحد آزمون");
    const roles = within(first).getByRole("list", { name: "نقش‌های کاربر آزمون یکم" });
    expect(
      within(roles)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["عضو GRC", "مدیر واحد"]);
    expect(first).toHaveTextContent("فعال");
    expect(within(table).getByText("کاربر آزمون دوم").closest("tr")).toHaveTextContent("غیرفعال");
    expect(screen.getByRole("link", { name: "ورود کارکنان" })).toHaveAttribute("href", "/accounts/staff-import");
    expect(screen.getByRole("search", { name: "فیلتر کاربران" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("holidays", () => {
  it("lists this year's holidays with named edit and delete buttons", async () => {
    pageAt("/holidays/", holidayList());
    renderPage(<HolidayListPage />, { path: "/holidays" });
    const table = await screen.findByRole("table", { name: /تعطیلات/ });
    const row = within(table).getByText("تعطیلی آزمون یکم").closest("tr")!;
    expect(row).toHaveTextContent("پنجشنبه");
    expect(within(row).getByRole("link", { name: "ویرایش تعطیلی آزمون یکم" })).toHaveAttribute(
      "href",
      "/holidays/1/edit",
    );
    expect(within(row).getByRole("button", { name: "حذف تعطیلی آزمون یکم" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تعطیلی تازه" })).toHaveAttribute("href", "/holidays/new");
    expect(screen.getByText(/پنجشنبه و جمعه همیشه تعطیل‌اند/)).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows the year Django chose and sends an empty year for every year", async () => {
    const api = pageAt("/holidays/", holidayList());
    const { user } = renderPage(<HolidayListPage />, { path: "/holidays" });
    const year = await screen.findByRole("combobox", { name: "سال" });
    // نشانی سالی ندارد ولی view تعطیلات امسال را داده است؛ فیلتر هم همان را نشان می‌دهد.
    expect(year).toHaveValue("1405");

    await user.selectOptions(year, "همه‌ی سال‌ها");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/holidays?year="));
    await waitFor(() => expect(api.callsTo("GET pages/").at(-1)!.query.get("path")).toBe("/holidays/?year="));
    expect(year).toHaveValue("");

    await user.selectOptions(year, "1404");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/holidays?year=1404"));
    // برداشتن فیلتر یعنی برگشتن به پیش‌فرض خود جنگو، نه «همه».
    await user.click(screen.getByRole("button", { name: "برداشتن فیلتر سال: 1404" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/holidays$/));
    expect(year).toHaveValue("1405");
  });

  it("asks before deleting and sends the delete to the Django view", async () => {
    const api = mockApi({
      "GET pages/": holidayList(),
      "POST forms/": {
        message: "تعطیلی «تعطیلی آزمون یکم» حذف شد.",
        redirect: { href: "/holidays/", route: "/holidays" },
      },
    });
    const { user } = renderPage(<HolidayListPage />, { path: "/holidays" });
    await user.click(await screen.findByRole("button", { name: "حذف تعطیلی آزمون یکم" }));

    const dialog = await screen.findByRole("alertdialog", { name: "تعطیلی «تعطیلی آزمون یکم» حذف شود؟" });
    expect(within(dialog).getByRole("button", { name: "انصراف" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "حذف تعطیلی" }));

    await waitFor(() => expect(api.callsTo("POST forms/")).toHaveLength(1));
    expect(api.callsTo("POST forms/")[0]!.query.get("path")).toBe("/holidays/1/delete/");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByText("تعطیلی «تعطیلی آزمون یکم» حذف شد.")).toBeInTheDocument();
  });
});

describe("audit", () => {
  it("shows events with warnings marked and the Excel export carrying the filters", async () => {
    pageAt("/audit/", auditEventList({ export_url: "/audit/export/?event=login_failed" }));
    renderPage(<AuditEventListPage />, { path: "/audit?event=login_failed" });
    const table = await screen.findByRole("table", { name: /رویدادها/ });
    const denied = within(table).getByText("دسترسی ردشده").closest("tr")!;
    expect(denied).toHaveTextContent("کاربر آزمون یکم");
    expect(denied).toHaveTextContent("/accounts/users/");
    expect(denied).toHaveTextContent("۱۸ آبان ۱۴۰۵، ساعت ۱۴:۰۴");
    const failed = within(table).getByText("ورود ناموفق").closest("tr")!;
    expect(failed).toHaveTextContent("unknown");
    expect(failed).toHaveTextContent("10.20.1.99");
    expect(within(table).getByText("خروجی گرفتن").closest("tr")).toHaveTextContent("خط فرمان");

    const tabs = screen.getByRole("navigation", { name: "بخش‌های سوابق ممیزی" });
    expect(within(tabs).getByRole("link", { name: "ورود و رویدادها" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "تغییرات داده" })).toHaveAttribute("href", "/audit/changes");
    // خروجی فایل را خود جنگو می‌سازد؛ پیوند عادی است و از رابط React رد نمی‌شود.
    expect(screen.getByRole("link", { name: "خروجی Excel" })).toHaveAttribute(
      "href",
      "/audit/export/?event=login_failed",
    );
    await expectNoAxeViolations();
  });

  it("filters by Jalali dates only once a whole date is typed", async () => {
    const api = pageAt("/audit/", auditEventList());
    const { user } = renderPage(<AuditEventListPage />, { path: "/audit" });
    const start = await screen.findByRole("textbox", { name: "از تاریخ" });
    await user.type(start, "1405/08");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/audit$/);
    await user.type(start, "/01");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/audit?start=1405%2F08%2F01"));
    await waitFor(() =>
      expect(api.callsTo("GET pages/").at(-1)!.query.get("path")).toBe("/audit/?start=1405%2F08%2F01"),
    );
    await user.clear(start);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/audit$/));
  });

  it("shows Django's filter error and leaves the export out while the filters are wrong", async () => {
    const data = auditEventList({ export_url: null, results: [], count: 0 });
    const end = data.filters!.fields.find((field) => field.name === "end")!;
    end.value = "1405/01/01";
    end.errors = ["«تا تاریخ» نباید پیش از «از تاریخ» باشد."];
    pageAt("/audit/", data);
    renderPage(<AuditEventListPage />, { path: "/audit?start=1405/02/01&end=1405/01/01" });
    expect(await screen.findByText("رویدادی با این مشخصات پیدا نشد")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "تا تاریخ" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(/«تا تاریخ» نباید پیش از «از تاریخ» باشد/);
    expect(screen.queryByRole("link", { name: "خروجی Excel" })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it("shows what each change replaced, and an edit whose fields are not shown", async () => {
    pageAt("/audit/changes/", auditChangeList());
    renderPage(<AuditChangeListPage />, { path: "/audit/changes" });
    const table = await screen.findByRole("table", { name: /تغییرات داده/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("مناسبت:");
    expect(within(rows[0]!).getByText("عنوان قدیم آزمون").tagName).toBe("DEL");
    expect(within(rows[0]!).getByText("عنوان تازه‌ی آزمون").tagName).toBe("INS");
    expect(rows[0]).toHaveTextContent("۱۴۰۵/۰۸/۲۹ تعطیلی آزمون");
    expect(rows[1]).toHaveTextContent("فیلدی که این‌جا نشان داده شود عوض نشد (مثلاً رمز یا نقش)");
    expect(rows[1]).toHaveTextContent("تغییر رمز");
    expect(rows[2]).toHaveTextContent("ایجاد");
    expect(rows[2]).toHaveTextContent("خط فرمان");
    // نوع رکورد اجباری است: گزینه‌ی «همه» ندارد و همان نوعی را نشان می‌دهد که جنگو انتخاب کرده است.
    const model = screen.getByRole("combobox", { name: "نوع رکورد" });
    expect(model).toHaveValue("workcalendar.holiday");
    expect(within(model).queryByRole("option", { name: "همه" })).not.toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "بخش‌های سوابق ممیزی" });
    expect(within(tabs).getByRole("link", { name: "تغییرات داده" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "خروجی Excel" })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });
});

describe("staff import", () => {
  function setup(confirmReply: unknown = staffImportDone()) {
    const api = mockApi({
      "GET forms/": (call: ApiCall) =>
        call.query.get("path") === "/accounts/staff-import/" ? staffImportForm() : reply(404),
      "POST forms/": (call: ApiCall) =>
        call.query.get("path") === "/accounts/staff-import/" ? staffImportDryRun() : confirmReply,
    });
    const view = renderPage(<StaffImportPage />, { path: "/accounts/staff-import" });
    return { api, ...view };
  }

  async function uploadFile(user: ReturnType<typeof setup>["user"]) {
    const input = await screen.findByLabelText(/^فایل Excel منابع انسانی/);
    await user.upload(input, new File(["PK"], "staff.xlsx"));
    await user.click(screen.getByRole("checkbox", { name: /غیرفعال شوند/ }));
    await user.click(screen.getByRole("button", { name: "بارگذاری و گزارش آزمایشی" }));
  }

  it("uploads the file, shows the dry run and saves only on confirm", async () => {
    const { api, user } = setup();
    expect(
      await screen.findByRole("heading", { name: "ورود کارکنان از فایل منابع انسانی", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/تا آن را تأیید نکنید، چیزی ذخیره نمی‌شود/)).toBeInTheDocument();
    await expectNoAxeViolations();
    await uploadFile(user);

    const report = await screen.findByText("گزارش آزمایشی");
    await waitFor(() => expect(report).toHaveFocus());
    expect(screen.getByText("اجرای آزمایشی: هنوز چیزی ذخیره نشده است.")).toBeInTheDocument();
    const [upload] = api.callsTo("POST forms/");
    const body = upload!.body as FormData;
    expect((body.get("file") as File).name).toBe("staff.xlsx");
    expect(body.get("deactivate_missing")).toBe("on");

    // بخش‌های هشدار و خطا باز و بقیه بسته‌اند.
    const skipped = screen.getByText("ردیف‌هایی که وارد نشدند").closest("details")!;
    expect(skipped).toHaveAttribute("open");
    expect(skipped).toHaveTextContent("ردیف ۴: کد پرسنلی خالی است.");
    expect(screen.getByText("واحدهای تازه").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("کاربران تازه").closest("details")).toBeNull();
    await expectNoAxeViolations();

    await user.click(screen.getByRole("button", { name: "تأیید و ذخیره" }));
    expect(await screen.findByText("گزارش آن‌چه انجام شد")).toBeInTheDocument();
    const confirm = api.callsTo("POST forms/")[1]!;
    expect(confirm.query.get("path")).toBe("/accounts/staff-import/confirm/");
    expect((confirm.body as { values: Record<string, unknown> }).values).toEqual({
      token: "00000000-0000-4000-8000-000000000000",
      deactivate_missing: false,
      confirm: "",
    });
    // پیام جنگو هم در اعلان می‌آید و هم بالای گزارش می‌ماند.
    expect(screen.getAllByText("کارکنان وارد شدند. گزارش آن‌چه انجام شد:")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "تأیید و ذخیره" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "بارگذاری فایل دیگر" }));
    expect(await screen.findByRole("button", { name: "بارگذاری و گزارش آزمایشی" })).toBeInTheDocument();
  });

  it("cancels back to the upload form", async () => {
    const cancelled = {
      message: "ورود لغو شد و فایل پاک شد.",
      redirect: { href: "/accounts/staff-import/", route: "/accounts/staff-import" },
    };
    const { api, user } = setup(cancelled);
    await uploadFile(user);
    await user.click(await screen.findByRole("button", { name: "انصراف" }));

    expect(await screen.findByRole("button", { name: "بارگذاری و گزارش آزمایشی" })).toBeInTheDocument();
    expect(screen.getByText("ورود لغو شد و فایل پاک شد.")).toBeInTheDocument();
    expect((api.callsTo("POST forms/")[1]!.body as { values: Record<string, unknown> }).values).toHaveProperty(
      "cancel",
      "",
    );
  });

  it("offers a new upload when the waiting file is gone", async () => {
    const gone = reply(400, {
      message: "فایل پیدا نشد؛ یا پیش‌تر تأیید یا لغو شده یا فایل تازه‌تری بارگذاری شده است.",
      redirect: { href: "/accounts/staff-import/", route: "/accounts/staff-import" },
    });
    const { user } = setup(gone);
    await uploadFile(user);
    await user.click(await screen.findByRole("button", { name: "تأیید و ذخیره" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("فایل پیدا نشد");
    expect(screen.queryByRole("button", { name: "تأیید و ذخیره" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بارگذاری فایل دیگر" })).toBeInTheDocument();
  });
});
