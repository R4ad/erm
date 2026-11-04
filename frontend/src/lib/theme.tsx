import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useMediaQuery } from "./hooks";
import { readPreference, writePreference } from "./storage";

export const THEMES = ["dark", "light", "system"] as const;
export type ThemeChoice = (typeof THEMES)[number];
type Resolved = "dark" | "light";

const THEME_COLORS: Record<Resolved, string> = { dark: "#09090B", light: "#FAFAFA" };

interface ThemeState {
  choice: ThemeChoice;
  resolved: Resolved;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** تم را پیش از اولین رندر روی <html> می‌گذارد تا صفحه با رنگ اشتباه چشمک نزند. */
export function applyStoredTheme() {
  const choice = readPreference("theme", THEMES, "dark");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  apply(choice === "system" ? (prefersLight ? "light" : "dark") : choice);
}

function apply(resolved: Resolved) {
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolved]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readPreference("theme", THEMES, "dark"));
  const prefersLight = useMediaQuery("(prefers-color-scheme: light)");
  const resolved: Resolved = choice === "system" ? (prefersLight ? "light" : "dark") : choice;

  useEffect(() => apply(resolved), [resolved]);

  function setChoice(next: ThemeChoice) {
    setChoiceState(next);
    writePreference("theme", next);
  }

  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme outside ThemeProvider");
  return theme;
}
