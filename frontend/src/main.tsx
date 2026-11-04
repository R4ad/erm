import "@fontsource/vazirmatn/arabic-400.css";
import "@fontsource/vazirmatn/arabic-500.css";
import "@fontsource/vazirmatn/arabic-700.css";
import "@fontsource/vazirmatn/latin-400.css";
import "@fontsource/vazirmatn/latin-500.css";
import "@fontsource/vazirmatn/latin-700.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "./styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, useParams } from "react-router-dom";

import { ApiError } from "./api";
import { Shell } from "./components/Shell";
import { AnswerHome } from "./pages/AnswerHome";
import { MyWork } from "./pages/MyWork";
import { NotFound } from "./pages/NotFound";
import { ResponseForm } from "./pages/ResponseForm";
import { ResponseStart } from "./pages/ResponseStart";
import { RiskDetail } from "./pages/RiskDetail";
import { RiskList } from "./pages/RiskList";
import { RiskQuestions } from "./pages/RiskQuestions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // ۴۰۳ و ۴۰۴ با تکرار درست نمی‌شوند؛ فقط خطای شبکه و سرور یک بار دیگر امتحان می‌شود.
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status > 0 && error.status < 500),
    },
  },
});

/** صفحه‌ای که state محلی دارد (پیش‌نویس پاسخ، فرم شروع) با عوض شدن :id از نو ساخته می‌شود، نه با state صفحه‌ی قبلی. */
function keyedById(Page: ComponentType) {
  return function Keyed() {
    const { id } = useParams();
    return <Page key={id} />;
  };
}

const ResponseFormPage = keyedById(ResponseForm);
const ResponseStartPage = keyedById(ResponseStart);

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Shell />,
      children: [
        { index: true, element: <MyWork /> },
        { path: "risks", element: <RiskList /> },
        { path: "risks/:id", element: <RiskDetail /> },
        { path: "questionnaires", element: <AnswerHome /> },
        { path: "questionnaires/risk-questions", element: <RiskQuestions /> },
        { path: "questionnaires/:id/start", element: <ResponseStartPage /> },
        { path: "responses/:id", element: <ResponseFormPage /> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  { basename: "/app" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
