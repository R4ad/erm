import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useSession } from "@/features/session/session";
import { useTitle } from "@/lib/hooks";
import { t } from "@/lib/i18n";

export function NotFoundPage() {
  useTitle("صفحه پیدا نشد");
  const session = useSession();
  return (
    <EmptyState
      as="h1"
      className="mt-6"
      icon={<Compass />}
      title="این صفحه در رابط تازه نیست"
      description="نشانی را بررسی کنید. صفحه‌هایی که هنوز به رابط تازه نیامده‌اند از منوی کنار صفحه یا صفحه‌های فعلی باز می‌شوند."
      action={
        <>
          <Button asChild variant="primary">
            <Link to="/" viewTransition>
              کارهای من
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <a href={session.classic_home}>{t("shell.classicHome")}</a>
          </Button>
        </>
      }
    />
  );
}
