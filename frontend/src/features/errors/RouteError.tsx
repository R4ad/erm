import { RefreshCw, TriangleAlert } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { t } from "@/lib/i18n";

/** بعد از انتشار نسخه‌ی تازه، فایل‌های بخش‌های کد نسخه‌ی قبل دیگر روی سرور نیستند. */
function isStaleChunk(error: unknown) {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error.message)
  );
}

export function RouteError({ inline = false }: { inline?: boolean }) {
  const error = useRouteError();
  const stale = isStaleChunk(error);
  const message = stale
    ? t("state.newVersion")
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : errorMessage(error);

  const content = (
    <EmptyState
      as="h1"
      icon={stale ? <RefreshCw /> : <TriangleAlert />}
      title={stale ? "نسخه‌ی تازه آماده است" : "این صفحه باز نشد"}
      description={message}
      action={
        <>
          <Button variant="primary" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden />
            {t("state.reload")}
          </Button>
          {!stale && (
            <Button asChild variant="secondary">
              <Link to="/">کارهای من</Link>
            </Button>
          )}
        </>
      }
    />
  );

  if (inline) return <div role="alert">{content}</div>;
  return (
    <main role="alert" className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <div className="w-full">{content}</div>
    </main>
  );
}
