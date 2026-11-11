"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/prefs-shared";

/**
 * Светлая / тёмная тема. Выбор хранится в localStorage (dexa.theme), по умолчанию — как в системе.
 * Класс .dark ставит скрипт в <head> до отрисовки (без вспышки), провайдер держит его в актуальном виде.
 */

export type ThemeChoice = "light" | "dark" | "system";

const Ctx = createContext<{ choice: ThemeChoice; dark: boolean; setChoice: (c: ThemeChoice) => void; toggle: () => void } | null>(null);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let saved: ThemeChoice = "system";
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "light" || v === "dark" || v === "system") saved = v;
    } catch {
      /* private mode */
    }
    setChoiceState(saved);
  }, []);

  useEffect(() => {
    const apply = () => {
      const d = choice === "dark" || (choice === "system" && systemDark());
      document.documentElement.classList.toggle("dark", d);
      document.documentElement.style.colorScheme = d ? "dark" : "light";
      setDark(d);
    };
    apply();
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      /* private mode */
    }
    setChoiceState(c);
  }, []);

  const toggle = useCallback(() => setChoice(dark ? "light" : "dark"), [dark, setChoice]);
  const value = useMemo(() => ({ choice, dark, setChoice, toggle }), [choice, dark, setChoice, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme вне ThemeProvider");
  return ctx;
}
