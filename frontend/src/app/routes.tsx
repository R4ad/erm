import type { ComponentType } from "react";
import { useParams, type RouteObject } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/ui/skeleton";
import { RouteError } from "@/features/errors/RouteError";

/** صفحه‌ای که state محلی دارد (پیش‌نویس پاسخ، فرم شروع) با عوض شدن :id از نو ساخته می‌شود، نه با state صفحه‌ی قبلی. */
function keyedById(Page: ComponentType) {
  return function Keyed() {
    const { id } = useParams();
    return <Page key={id} />;
  };
}

// هر صفحه بخش جدای کد خودش است و فقط وقتی باز می‌شود دانلود می‌شود.
export const routes: RouteObject[] = [
  {
    path: "/login",
    lazy: async () => ({ Component: (await import("@/features/auth/LoginPage")).LoginPage }),
    errorElement: <RouteError />,
    HydrateFallback: () => null,
  },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    HydrateFallback: () => null,
    children: [
      {
        errorElement: <RouteError inline />,
        hydrateFallbackElement: <PageSkeleton />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import("@/features/my-work/MyWorkPage")).MyWorkPage }),
          },
          {
            path: "risks",
            lazy: async () => ({ Component: (await import("@/features/risks/RiskListPage")).RiskListPage }),
          },
          {
            path: "risks/:id",
            lazy: async () => ({ Component: (await import("@/features/risks/RiskDetailPage")).RiskDetailPage }),
          },
          {
            path: "questionnaires",
            lazy: async () => ({
              Component: (await import("@/features/questionnaires/AnswerHomePage")).AnswerHomePage,
            }),
          },
          {
            path: "questionnaires/risk-questions",
            lazy: async () => ({
              Component: (await import("@/features/questionnaires/RiskQuestionsPage")).RiskQuestionsPage,
            }),
          },
          {
            path: "questionnaires/:id/start",
            lazy: async () => ({
              Component: keyedById((await import("@/features/questionnaires/ResponseStartPage")).ResponseStartPage),
            }),
          },
          {
            path: "responses/:id",
            lazy: async () => ({
              Component: keyedById((await import("@/features/questionnaires/ResponseFormPage")).ResponseFormPage),
            }),
          },
          {
            path: "*",
            lazy: async () => ({ Component: (await import("@/features/errors/NotFoundPage")).NotFoundPage }),
          },
        ],
      },
    ],
  },
];
