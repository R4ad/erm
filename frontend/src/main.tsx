import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/vazirmatn/wght.css";
import "./styles/index.css";

import { setNonce } from "get-nonce";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { createQueryClient } from "./app/query-client";
import { Providers } from "./app/providers";
import { routes } from "./app/routes";
import { applyStoredTheme } from "./lib/theme";

// قفل اسکرول پنجره‌های Radix یک <style> می‌سازد؛ با nonce صفحه، CSP آن را می‌پذیرد.
const nonce = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce;
if (nonce) setNonce(nonce);
applyStoredTheme();

const router = createBrowserRouter(routes, { basename: "/app" });
const queryClient = createQueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("#root در index.html نیست");

createRoot(root).render(
  <StrictMode>
    <Providers client={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
