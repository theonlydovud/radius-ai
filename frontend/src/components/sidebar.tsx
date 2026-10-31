"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquareText,
  BookOpen,
  ShieldCheck,
  ClipboardList,
  BarChart3,
  Inbox,
  Plug,
  Waypoints,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/playground", label: "Диалог с ИИ", icon: MessageSquareText },
  { href: "/knowledge", label: "Знания ИИ", icon: BookOpen },
  { href: "/rules", label: "Правила общения", icon: ShieldCheck },
  { href: "/leads", label: "Заявки", icon: ClipboardList },
  { href: "/stats", label: "Статистика", icon: BarChart3 },
  { href: "/inbox", label: "История чатов", icon: Inbox },
  { href: "/accounts", label: "Аккаунты", icon: Plug },
  { href: "/settings", label: "Настройки", icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
        <Waypoints className="h-4 w-4 text-white" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">Radius AI</p>
        <p className="text-[11px] text-slate-400">Radius Logistics</p>
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
                  ? "bg-slate-100 font-medium text-slate-900"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-slate-200 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
          ГР
        </div>
        <div className="leading-tight">
          <p className="text-xs font-medium text-slate-800">Голиб Рахматов</p>
          <p className="text-[11px] text-slate-400">CEO/Директор</p>
        </div>
      </div>
    </>
  );
}

/** Сайдбар для экранов от планшета и шире. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
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
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {current && <span className="max-w-[9rem] truncate text-xs text-slate-500">{current.label}</span>}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-950/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть меню"
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
