import { expect, expectAccessible, reply, test } from "./fixtures";

// مرورگر جواب ۴۰۰ ورود اشتباه را در کنسول می‌نویسد؛ آن یکی خطای برنامه نیست.
test.use({ allowConsoleErrors: [/status of 400/] });

test.describe("login", () => {
  test("validates, explains a wrong password and signs in to the requested page", async ({ page, api }) => {
    await page.goto("/app/login/?next=%2Fapp%2Frisks");
    await expect(page.getByRole("heading", { name: "ورود به سامانه" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByText("نام کاربری را وارد کنید.")).toBeVisible();
    await expect(page.getByLabel("نام کاربری")).toBeFocused();

    api.on("POST auth/login/", reply(400, { message: "نام کاربری یا گذرواژه درست نیست.", errors: {} }));
    await page.getByLabel("نام کاربری").fill("tester");
    await page.getByLabel("گذرواژه", { exact: true }).fill("wrong-pass");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page.getByRole("alert")).toHaveText("نام کاربری یا گذرواژه درست نیست.");
    await expect(page.getByLabel("گذرواژه", { exact: true })).toBeFocused();
    await expect(page.getByLabel("گذرواژه", { exact: true })).toHaveValue("");

    api.on("POST auth/login/", (call: { body: { next: string } }) => ({ next: call.body.next }));
    await page.getByLabel("گذرواژه", { exact: true }).fill("secret-pass");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page).toHaveURL(/\/app\/risks$/);
    await expect(page.getByRole("heading", { name: "رجیستر ریسک", level: 1 })).toBeVisible();

    const [login] = api.callsTo("POST auth/login/").slice(-1);
    expect(login?.headers["x-csrftoken"]).toBe("e2e-csrf-token");
    expect(login?.body).toEqual({ username: "tester", password: "secret-pass", next: "/app/risks" });
  });
});
