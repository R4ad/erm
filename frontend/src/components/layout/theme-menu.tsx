import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { t } from "@/lib/i18n";
import { THEMES, useTheme, type ThemeChoice } from "@/lib/theme";

const icons = { dark: Moon, light: Sun, system: Monitor } as const;

export function ThemeMenu() {
  const { choice, resolved, setChoice } = useTheme();
  const Current = icons[resolved];
  return (
    <DropdownMenu>
      <Tooltip content={t("theme.label")} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${t("theme.label")}: ${t(`theme.${choice}`)}`}>
            <Current />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => setChoice(value as ThemeChoice)}>
          {THEMES.map((theme) => {
            const Icon = icons[theme];
            return (
              <DropdownMenuRadioItem key={theme} value={theme}>
                <Icon aria-hidden />
                {t(`theme.${theme}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
