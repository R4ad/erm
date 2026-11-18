/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ساخت نهایی زیر /static/spa/ سرو می‌شود (Django پوشه‌ی dist را با پیشوند spa به staticfiles می‌دهد) و صفحه‌ی
// /app/ همان index.html را برمی‌گرداند. در اجرای npm run dev همه‌چیز جز /app/ به Django روی پورت 8000 می‌رود:
// API، و صفحه‌های جنگویی که هنوز به React نیامده‌اند.
const django = process.env.DJANGO_URL ?? "http://127.0.0.1:8000";

// جنگو در هر بار دادن index.html این نشانه را با nonce تازه‌ی همان درخواست عوض می‌کند (apps/api/spa.py) و CSP فقط
// اسکریپت و استایل‌های همین سایت یا با همان nonce را می‌پذیرد.
const CSP_NONCE_PLACEHOLDER = "__CSP_NONCE__";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/static/spa/" : "/app/",
  html: command === "build" ? { cspNonce: CSP_NONCE_PLACEHOLDER } : undefined,
  // React Compiler کامپوننت‌ها را خودکار memo می‌کند؛ useMemo و useCallback دستی لازم نیست.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "^/(?!app(?:/|$)).*": { target: django, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    // jsdom ‏document.startViewTransition ندارد؛ React Router در این حالت ناوبری را بی‌انیمیشن انجام می‌دهد و فقط
    // همین تذکر را یک بار در هر فایل چاپ می‌کند. View Transition واقعی را آزمون e2e در مرورگر می‌بیند.
    onConsoleLog: (log) => !log.includes("`viewTransition` option to a router update"),
  },
}));
