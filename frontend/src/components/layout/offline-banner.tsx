import { WifiOff } from "lucide-react";

import { useOnline } from "@/lib/hooks";
import { t } from "@/lib/i18n";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="pad-safe flex items-center gap-2.5 border-b border-warning/30 bg-warning-soft py-2.5 text-sm text-fg"
    >
      <WifiOff aria-hidden className="size-4 shrink-0 text-warning" />
      {t("state.offline")}
    </div>
  );
}
