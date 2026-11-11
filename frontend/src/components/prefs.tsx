"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe, Moon, Sun } from "lucide-react";
import { LANGS, t, useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Переключатели языка (UZ/RU/EN) и темы (светлая/тёмная) — для всех экранов. */

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { dark, toggle } = useTheme();
  const label = dark ? t("Светлая тема") : t("Тёмная тема");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800",
        withLabel ? "px-3 text-sm" : "w-9",
        className
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {withLabel && <span>{label}</span>}
    </button>
  );
}

export function LangSwitcher({ className, up = false }: { className?: string; up?: boolean }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = LANGS.find((l) => l.value === lang)!;
  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Язык")}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <Globe className="h-4 w-4" />
        {current.label}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-50 w-40 overflow-hidden rounded-xl border border-slate-200 bg-surface p-1 shadow-lg",
            up ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {LANGS.map((l) => (
            <button
              key={l.value}
              role="menuitemradio"
              aria-checked={l.value === lang}
              onClick={() => {
                setOpen(false);
                setLang(l.value);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="w-7 text-xs font-semibold text-slate-400">{l.label}</span>
              <span className="flex-1">{l.name}</span>
              {l.value === lang && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
