import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { leaveTo, replaceWith } from "@/lib/navigation";
import { mockApi, reply } from "@/test/api";
import { expectNoAxeViolations } from "@/test/axe";
import { csrf } from "@/test/fixtures";
import { renderPage } from "@/test/render";

import { LoginPage } from "./LoginPage";

function renderLogin(path = "/login") {
  return renderPage(<LoginPage />, { path, route: "/login", withSession: false });
}

describe("LoginPage", () => {
  it("validates before sending anything", async () => {
    const api = mockApi({ "GET auth/csrf/": csrf() });
    const { user } = renderLogin();
    const submit = await screen.findByRole("button", { name: "ورود" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    expect(await screen.findByText("نام کاربری را وارد کنید.")).toBeInTheDocument();
    expect(screen.getByText("گذرواژه را وارد کنید.")).toBeInTheDocument();
    expect(screen.getByLabelText("نام کاربری")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("نام کاربری")).toHaveFocus();
    expect(api.callsTo("POST auth/login/")).toHaveLength(0);
    await expectNoAxeViolations();
  });

  it("logs in with the CSRF token and goes to the requested page", async () => {
    document.cookie = "csrftoken=login-token";
    const api = mockApi({
      "GET auth/csrf/": csrf(),
      "POST auth/login/": { next: "/app/risks?status=assessment" },
    });
    const { user } = renderLogin("/login?next=%2Fapp%2Frisks%3Fstatus%3Dassessment");
    await user.type(screen.getByLabelText("نام کاربری"), "  tester ");
    await user.type(screen.getByLabelText("گذرواژه"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "ورود" }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/app/risks?status=assessment"));
    const [call] = api.callsTo("POST auth/login/");
    expect(call?.headers.get("X-CSRFToken")).toBe("login-token");
    expect(call?.body).toEqual({ username: "tester", password: "secret-pass", next: "/app/risks?status=assessment" });
  });

  it("shows the server's message, clears the password and focuses it", async () => {
    mockApi({
      "GET auth/csrf/": csrf(),
      "POST auth/login/": reply(400, { message: "نام کاربری یا گذرواژه درست نیست.", errors: {} }),
    });
    const { user } = renderLogin();
    await user.type(screen.getByLabelText("نام کاربری"), "tester");
    await user.type(screen.getByLabelText("گذرواژه"), "wrong");
    await user.click(screen.getByRole("button", { name: "ورود" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("نام کاربری یا گذرواژه درست نیست.");
    const password = screen.getByLabelText("گذرواژه");
    expect(password).toHaveValue("");
    expect(password).toHaveFocus();
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("refreshes a stale CSRF token after a 403", async () => {
    const api = mockApi({
      "GET auth/csrf/": csrf(),
      "POST auth/login/": reply(403, { detail: "CSRF Failed" }),
    });
    const { user } = renderLogin();
    await user.type(screen.getByLabelText("نام کاربری"), "tester");
    await user.type(screen.getByLabelText("گذرواژه"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "ورود" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("صفحه‌ی ورود کهنه شده بود");
    await waitFor(() => expect(api.callsTo("GET auth/csrf/")).toHaveLength(2));
  });

  it("toggles password visibility with a pressed state", async () => {
    mockApi({ "GET auth/csrf/": csrf() });
    const { user } = renderLogin();
    const toggle = screen.getByRole("button", { name: "نمایش گذرواژه" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "پنهان کردن گذرواژه" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("گذرواژه")).toHaveAttribute("type", "text");
  });

  it("sends a signed-in user on without showing the form, but never off-site", async () => {
    mockApi({ "GET auth/csrf/": csrf(true) });
    renderLogin("/login?next=https%3A%2F%2Fevil.example%2F");
    await waitFor(() => expect(replaceWith).toHaveBeenCalledWith("/app/"));
  });

  it("keeps the classic login reachable with the same destination", async () => {
    mockApi({ "GET auth/csrf/": csrf() });
    renderLogin("/login?next=%2Fapp%2Frisks");
    expect(screen.getByRole("link", { name: "ورود با صفحه‌ی فعلی سامانه" })).toHaveAttribute(
      "href",
      "/accounts/login/?classic=1&next=%2Fapp%2Frisks",
    );
  });
});
