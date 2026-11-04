import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { startForm } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { ResponseStartPage } from "./ResponseStartPage";

const options = { path: "/questionnaires/1/start", route: "/questionnaires/:id/start" };

describe("ResponseStartPage", () => {
  it("requires the unit and opens the new response", async () => {
    const api = mockApi({ "GET questionnaires/1/start/": startForm(), "POST questionnaires/1/start/": { id: 9 } });
    const { user } = renderPage(<ResponseStartPage />, options);
    await user.click(await screen.findByRole("button", { name: "شروع پاسخ" }));
    expect(await screen.findByText("واحد را انتخاب کنید.")).toBeInTheDocument();
    expect(api.callsTo("POST questionnaires/1/start/")).toHaveLength(0);
    await expectNoAxeViolations();

    await user.selectOptions(screen.getByRole("combobox", { name: /واحد/ }), "1");
    await user.click(screen.getByRole("button", { name: "شروع پاسخ" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/responses/9"));
    expect(api.callsTo("POST questionnaires/1/start/")[0]?.body).toEqual({ org_unit: "1", service: "" });
  });

  it("shows the server's reason on the field", async () => {
    mockApi({
      "GET questionnaires/1/start/": startForm(),
      "POST questionnaires/1/start/": reply(400, { errors: { service: ["این خدمت برای این واحد نیست."] } }),
    });
    const { user } = renderPage(<ResponseStartPage />, options);
    await user.selectOptions(await screen.findByRole("combobox", { name: /واحد/ }), "1");
    await user.click(screen.getByRole("button", { name: "شروع پاسخ" }));
    const service = screen.getByRole("combobox", { name: "خدمت" });
    await waitFor(() => expect(service).toHaveAttribute("aria-invalid", "true"));
    expect(service).toHaveAccessibleDescription(/این خدمت برای این واحد نیست/);
  });
});
