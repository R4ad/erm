import { LogOut, SquareArrowOutUpLeft } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useLogout, useSession } from "@/features/session/session";
import { errorMessage } from "@/lib/api";
import { t } from "@/lib/i18n";

/** دو حرف اول نام برای نشان کاربر؛ نام فارسی بدون فاصله‌ی حرف. */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("‌");
}

export function UserMenu() {
  const session = useSession();
  const logout = useLogout();
  const toast = useToast();
  const { user } = session;
  const detail = [user.job_title, user.org_unit].filter(Boolean).join("، ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("shell.account")}: ${user.name}`}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-transparent ps-1 pe-1 transition-colors hover:border-line hover:bg-surface sm:pe-3"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-xs font-bold text-accent-fg"
        >
          {initials(user.name)}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium text-fg sm:block">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex flex-col gap-1 px-2.5 py-2">
          <p className="text-sm font-semibold text-fg">{user.name}</p>
          {detail && <p className="text-xs text-muted">{detail}</p>}
          {user.roles.length > 0 && (
            <ul className="flex flex-wrap gap-1 pt-1.5" aria-label="نقش‌ها">
              {user.roles.map((role) => (
                <li key={role} className="rounded-md bg-accent-soft px-2 py-0.5 text-[0.6875rem] text-accent-text">
                  {role}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={session.classic_home}>
            <SquareArrowOutUpLeft aria-hidden className="ltr:-scale-x-100" />
            {t("shell.classicHome")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          tone="danger"
          disabled={logout.isPending}
          onSelect={(event) => {
            event.preventDefault();
            logout.mutate(undefined, {
              onError: (error) => toast({ title: errorMessage(error), tone: "danger" }),
            });
          }}
        >
          <LogOut aria-hidden className="rtl:-scale-x-100" />
          {logout.isPending ? t("shell.loggingOut") : t("shell.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
