import { defineConfig, devices } from "@playwright/test";

import type { TestOptions } from "./e2e/fixtures";

// آزمون‌های سرتاسری روی ساخت نهایی اجرا می‌شوند، با همان CSP و Trusted Types که جنگو می‌فرستد (e2e/server.mjs)،
// و هر درخواست /api/ را با داده‌ی آزمون جواب می‌دهند (e2e/fixtures.ts)؛ جنگو و پایگاه داده لازم نیست. هر صفحه در
// دسکتاپ و موبایل با تم داتین (تنها تم سامانه) با axe سنجیده می‌شود.
const port = 4173;

export default defineConfig<TestOptions>({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL,
    baseURL: `http://127.0.0.1:${port}`,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite build --logLevel warn && node e2e/server.mjs",
    url: `http://127.0.0.1:${port}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PORT: String(port) },
  },
});
