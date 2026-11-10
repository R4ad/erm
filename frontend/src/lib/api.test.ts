import { describe, expect, it } from "vitest";

import { mockApi, reply } from "@/test/api";

import { ApiError, csrfToken, errorMessage, get, post, put } from "./api";
import { leaveTo } from "./navigation";

describe("api", () => {
  it("reads the CSRF token from the cookie", () => {
    document.cookie = "other=1";
    document.cookie = "csrftoken=abc%3D123";
    expect(csrfToken()).toBe("abc=123");
  });

  it("sends the CSRF header only on writes", async () => {
    document.cookie = "csrftoken=token-1";
    const api = mockApi({ "GET risks/": { ok: true }, "POST auth/logout/": {}, "PUT responses/1/": {} });
    await get("risks/");
    await post("auth/logout/", {});
    await put("responses/1/", { submit: false });
    const [read, write, update] = api.calls;
    expect(read?.headers.get("X-CSRFToken")).toBeNull();
    expect(write?.headers.get("X-CSRFToken")).toBe("token-1");
    expect(update?.headers.get("X-CSRFToken")).toBe("token-1");
    expect(update?.body).toEqual({ submit: false });
    expect(update?.headers.get("Content-Type")).toBe("application/json");
  });

  it("turns error replies into ApiError with the server message and field errors", async () => {
    mockApi({ "POST auth/login/": reply(400, { message: "نام کاربری یا گذرواژه درست نیست.", errors: { a: ["x"] } }) });
    const error = await post("auth/login/", {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, errors: { a: ["x"] } });
    expect(errorMessage(error)).toBe("نام کاربری یا گذرواژه درست نیست.");
  });

  it("explains a missing backend instead of showing a bare status", async () => {
    mockApi({ "GET session/": reply(502) });
    const error = await get("session/").catch((caught: unknown) => caught);
    expect(errorMessage(error)).toContain("runserver");
  });

  it("marks network failures", async () => {
    globalThis.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const error = await get("session/").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetwork).toBe(true);
  });

  it("sends an expired session to the login page and comes back to the same page", async () => {
    window.history.replaceState(null, "", "/app/risks?q=x");
    mockApi({ "GET risks/": reply(403, { detail: "وارد نشده‌اید.", login_url: "/app/login/" }) });
    let settled = false;
    void get("risks/").finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(leaveTo).toHaveBeenCalledWith("/app/login/?next=%2Fapp%2Frisks%3Fq%3Dx");
    expect(settled).toBe(false);
  });

  it("passes aborts through so cancelled queries stay silent", async () => {
    const controller = new AbortController();
    globalThis.fetch = () => Promise.reject(new DOMException("aborted", "AbortError"));
    controller.abort();
    await expect(get("risks/", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
