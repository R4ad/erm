import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ساخت نهایی زیر /static/spa/ سرو می‌شود (Django پوشه‌ی dist را با پیشوند spa به staticfiles می‌دهد) و صفحه‌ی
// /app/ همان index.html را برمی‌گرداند. در اجرای npm run dev همه‌چیز جز /app/ به Django روی پورت 8000 می‌رود:
// API، صفحه‌ی ورود و صفحه‌های جنگویی که هنوز به React نیامده‌اند.
const django = process.env.DJANGO_URL ?? "http://127.0.0.1:8000";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/static/spa/" : "/app/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "^/(?!app(?:/|$)).*": { target: django, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
