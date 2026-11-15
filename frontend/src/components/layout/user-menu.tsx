import { LogOut, SquareArrowOutUpLeft } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { useLogout, useSession } from "@/features/session/session";
import { errorMessage } from "@/lib/api";
import { t } from "@/lib/i18n";

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
        className="rounded-full focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Avatar name={user.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex flex-col gap-1 px-2.5 py-2">
          <p className="text-sm font-semibold text-fg">{user.name}</p>
          {detail && <p className="text-xs text-muted">{detail}</p>}
          {user.roles.length > 0 && (
            <ul className="flex flex-wrap gap-1 pt-1.5" aria-label="نقش‌ها">
              {user.roles.map((role) => (
                <li key={role} className="rounded-sm bg-brand-subtle px-2 py-0.5 text-xs text-brand">
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
