"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquareText,
  BookOpen,
  ShieldCheck,
  ClipboardList,
  Inbox,
  Plug,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/playground", label: "Диалог с ИИ", icon: MessageSquareText },
  { href: "/knowledge", label: "Знания ИИ", icon: BookOpen },
  { href: "/rules", label: "Правила общения", icon: ShieldCheck },
  { href: "/leads", label: "Заявки", icon: ClipboardList },
  { href: "/inbox", label: "История чатов", icon: Inbox },
  { href: "/accounts", label: "Аккаунты", icon: Plug },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
          <Waypoints className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">Radius AI</p>
          <p className="text-[11px] text-slate-400">Radius Logistics</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
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
    </aside>
  );
}
