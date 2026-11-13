"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Users } from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { FullscreenButton } from "@/components/fullscreen-button";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { logout, useCurrentUser } from "@/components/current-user";
import { cn, initials } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Шапка одностраничных рабочих мест (менеджер, супер-админ): логотип, компания, меню пользователя. */
export function TopBar() {
  const { user, company } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <DexaLogo size={28} />
          <span className="hidden truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 sm:inline">{company.name}</span>
        </div>
        <div className="flex items-center gap-1">
        <LangSwitcher className="hidden sm:block" />
        <ThemeToggle />
        <FullscreenButton />
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white",
                user.role === "admin" ? "from-[#5B4CED] to-[#8E5CF7]" : "from-[#7A6CFF] to-[#22a2c8]"
              )}
            >
              {initials(user.name)}
            </span>
            <span className="hidden text-sm font-medium text-slate-800 sm:inline">{user.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-surface p-1 shadow-lg">
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">
                  {user.roleLabel} · {company.name}
                </p>
              </div>
              <div className="my-1 h-px bg-slate-100" />
              <div className="px-1 sm:hidden">
                <LangSwitcher />
              </div>
              <button role="menuitem" onClick={() => logout("user")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Users className="h-4 w-4 text-slate-400" />
                {t("Сменить пользователя")}</button>
              <button role="menuitem" onClick={() => logout("all")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <LogOut className="h-4 w-4" />
                {t("Выйти")}</button>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}

/** 1 заявка, 2 заявки, 5 заявок. */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return t("Доброй ночи");
  if (h < 12) return t("Доброе утро");
  if (h < 18) return t("Добрый день");
  return t("Добрый вечер");
}
