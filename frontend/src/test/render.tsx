import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from "react-router-dom";

import { Providers } from "@/app/providers";
import { SessionProvider } from "@/features/session/session";

import { session } from "./fixtures";

/** نشانی فعلی مسیریاب، برای آزمون‌هایی که همگام شدن فیلترها با URL را می‌سنجند. */
export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

interface Options {
  /** نشانی آغاز، مثل /risks?q=درگاه */
  path?: string;
  /** الگوی مسیر صفحه، مثل /risks/:id */
  route?: string;
  /** مسیرهای دیگری که صفحه به آن‌ها پیوند دارد. */
  routes?: RouteObject[];
  withSession?: boolean;
}

/** یک صفحه را درون همان فراهم‌کننده‌های برنامه (Query، جهت، تم، Toast) و یک مسیریاب حافظه‌ای رندر می‌کند. */
export function renderPage(page: ReactElement, { path = "/", route, routes = [], withSession = true }: Options = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  const element = withSession ? <SessionProvider value={session()}>{page}</SessionProvider> : page;
  const router = createMemoryRouter(
    [
      {
        path: route ?? path.split("?")[0],
        element: (
          <>
            {element}
            <LocationProbe />
          </>
        ),
      },
      ...routes,
      { path: "*", element: <LocationProbe /> },
    ],
    { initialEntries: [path] },
  );
  const user = userEvent.setup();
  const view = render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...view, router, client, user };
}
