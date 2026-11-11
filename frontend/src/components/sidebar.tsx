"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquareText,
  Sparkles,
  BookOpen,
  ShieldCheck,
  ClipboardList,
  BarChart3,
  Inbox,
  Settings,
  Menu,
  X,
  LogOut,
  Users,
} from "lucide-react";
import { DexaMark } from "@/components/brand/dexa-logo";
import { FullscreenButton } from "@/components/fullscreen-button";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { AccountSwitcher } from "@/components/account-switcher";
import { logout, useCurrentUser } from "@/components/current-user";
import { cn, initials } from "@/lib/utils";
import { t } from "@/lib/i18n";

const NAV_ITEMS = [
  { href: "/assistant", get label() { return t("ИИ ассистент"); }, icon: Sparkles },
  { href: "/playground", get label() { return t("Диалог с ИИ"); }, icon: MessageSquareText },
  { href: "/knowledge", get label() { return t("Знания ИИ"); }, icon: BookOpen },
  { href: "/rules", get label() { return t("Правила общения"); }, icon: ShieldCheck },
  { href: "/leads", get label() { return t("Заявки"); }, icon: ClipboardList },
  { href: "/stats", get label() { return t("Статистика"); }, icon: BarChart3 },
  { href: "/inbox", get label() { return t("История чатов"); }, icon: Inbox },
  { href: "/settings", get label() { return t("Настройки"); }, icon: Settings },
];

function Brand() {
  const { company } = useCurrentUser();
  return (
    <div className="flex items-center gap-2">
      <DexaMark size={32} />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">
          Dexa<span className="text-brand">AI</span>
        </p>
        <p className="text-[11px] text-slate-400">{company.name}</p>
      </div>
    </div>
  );
}

/** Кто вошёл, смена пользователя (компания остаётся) и полный выход. */
function UserMenu() {
  const { user } = useCurrentUser();
  return (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D6BFF] to-[#A445F5] text-xs font-medium text-white">
          {initials(user.name)}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-xs font-medium text-slate-800">{user.name}</span>
          <span className="block truncate text-[11px] text-slate-400">{user.roleLabel}</span>
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => logout("user")}
          className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        >
          <Users className="h-3.5 w-3.5" />
          {t("Сменить")}</button>
        <button
          type="button"
          onClick={() => logout("all")}
          className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] text-slate-500 hover:bg-slate-50 hover:text-red-600"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("Выйти")}</button>
      </div>
    </div>
  );
}

/** Содержимое меню — общее для десктопного сайдбара и мобильной шторки. */
function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors md:py-2",
                active
                  ? "bg-brand-soft font-medium text-brand"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-1">
        <div className="flex items-center gap-1">
          <FullscreenButton />
          <ThemeToggle />
          <LangSwitcher up />
        </div>
      </div>
      <AccountSwitcher onNavigate={onNavigate} />
      <UserMenu />
    </>
  );
}

/** Сайдбар для экранов от планшета и шире. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-surface md:flex">
      <div className="px-5 py-5">
        <Brand />
      </div>
      <NavContent />
    </aside>
  );
}

/** Телефон: верхняя панель с кнопкой меню и выезжающая шторка. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => pathname?.startsWith(i.href));

  // Пока шторка открыта, страница под ней не прокручивается.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-surface/95 px-4 backdrop-blur md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {current && <span className="max-w-[9rem] truncate text-xs text-slate-500">{current.label}</span>}
          <FullscreenButton />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label={t("Открыть меню")}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={t("Закрыть меню")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
