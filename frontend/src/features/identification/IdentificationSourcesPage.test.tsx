import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { identificationSources } from "@/test/fixtures";
import { LocationProbe, renderPage } from "@/test/render";

import { ComingSoonPage } from "./ComingSoonPage";
import { IdentificationSourcesPage } from "./IdentificationSourcesPage";

describe("شناسایی ریسک (11 v2)", () => {
  it("کارت پاسخنامه‌ها را با آمار و چهار منبع «به‌زودی» نشان می‌دهد", async () => {
    mockApi({ "GET identification/sources/": identificationSources() });
    const { container, user } = renderPage(<IdentificationSourcesPage />, {
      path: "/identification",
      routes: [
        {
          path: "/identification/sources/:source",
          element: (
            <>
              <ComingSoonPage />
              <LocationProbe />
            </>
          ),
        },
      ],
    });

    expect(screen.getByRole("heading", { level: 1, name: "شناسایی ریسک" })).toBeInTheDocument();
    const hero = await screen.findByRole("region", { name: "پاسخنامه‌ها" });
    expect(
      within(hero)
        .getByText(/در انتظار بررسی$/)
        .closest("li"),
    ).toHaveTextContent("۸ در انتظار بررسی");
    expect(
      within(hero)
        .getByText(/بازگشت برای تکمیل$/)
        .closest("li"),
    ).toHaveTextContent("۳ بازگشت برای تکمیل");
    expect(
      within(hero)
        .getByText(/شناسایی‌شده$/)
        .closest("li"),
    ).toHaveTextContent("۱۲ شناسایی‌شده");
    expect(within(hero).getByRole("link", { name: "بررسی پاسخنامه‌ها" })).toHaveAttribute(
      "href",
      "/identification/responses",
    );
    expect(screen.getAllByText("به‌زودی")).toHaveLength(4);
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("link", { name: "نتایج جلسات ممیزی" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "شناسایی ریسک از نتایج جلسات ممیزی" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/identification/sources/audit");
  });

  it("صفحه‌ی «به‌زودی» راه بازگشت دارد و منبع ناشناخته پیدا نمی‌شود", async () => {
    const { container } = renderPage(<ComingSoonPage />, {
      path: "/identification/sources/changes",
      route: "/identification/sources/:source",
    });
    expect(
      screen.getByRole("heading", { level: 1, name: "شناسایی ریسک از فرآیند مدیریت تغییرات" }),
    ).toBeInTheDocument();
    expect(screen.getByText("به‌زودی")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "بازگشت به شناسایی ریسک" })).toHaveAttribute("href", "/identification");
    await expectNoAxeViolations(container);
  });

  it("منبع ناشناخته صفحه‌ی پیدا نشد است", () => {
    renderPage(<ComingSoonPage />, { path: "/identification/sources/x", route: "/identification/sources/:source" });
    expect(screen.getByRole("heading", { level: 1, name: "این صفحه در رابط تازه نیست" })).toBeInTheDocument();
  });
});
