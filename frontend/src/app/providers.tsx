import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Direction } from "radix-ui";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { locale } from "@/lib/i18n";

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <Direction.Provider dir={locale.dir}>
        <TooltipProvider delayDuration={350} skipDelayDuration={200}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </Direction.Provider>
    </QueryClientProvider>
  );
}
