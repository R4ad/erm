import { CircleAlert, CircleCheck, Info, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

import { Button } from "./button";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** سطح عنوان در ساختار صفحه؛ وقتی صفحه h1 جداگانه دارد h2. */
  as?: "h1" | "h2" | "h3";
}

export function EmptyState({ icon, title, description, action, className, as: Heading = "h2" }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-panel/50 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-2xl border border-line bg-surface text-accent-text [&_svg]:size-5"
      >
        {icon}
      </span>
      <Heading className="text-heading font-semibold text-fg">{title}</Heading>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

const alertTones = {
  info: { box: "border-info/25 bg-info-soft", icon: Info, color: "text-info" },
  success: { box: "border-success/25 bg-success-soft", icon: CircleCheck, color: "text-success" },
  warning: { box: "border-warning/30 bg-warning-soft", icon: TriangleAlert, color: "text-warning" },
  danger: { box: "border-danger/30 bg-danger-soft", icon: CircleAlert, color: "text-danger" },
} as const;

interface AlertProps {
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "alert" | "status";
  id?: string;
  tabIndex?: number;
  ref?: Ref<HTMLDivElement>;
}

export function Alert({ tone = "info", title, children, action, className, role, id, tabIndex, ref }: AlertProps) {
  const style = alertTones[tone];
  const Icon = style.icon;
  return (
    <div
      ref={ref}
      role={role}
      id={id}
      tabIndex={tabIndex}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm", style.box, className)}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-[1.125rem] shrink-0", style.color)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className="text-fg/90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** خطای خواندن داده، با دکمه‌ی تلاش دوباره. خطای شبکه نشانه‌ی قطع اتصال دارد. */
export function ErrorState({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  const network = error instanceof ApiError && error.isNetwork;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-6 py-10 text-center",
        className,
      )}
    >
      <span aria-hidden className="grid size-11 place-items-center rounded-2xl bg-danger/15 text-danger">
        {network ? <WifiOff className="size-5" /> : <CircleAlert className="size-5" />}
      </span>
      <p className="max-w-lg text-sm text-fg">{errorMessage(error)}</p>
      {retry && (
        <Button variant="secondary" size="sm" onClick={retry}>
          <RefreshCw aria-hidden />
          {t("state.retry")}
        </Button>
      )}
    </div>
  );
}
