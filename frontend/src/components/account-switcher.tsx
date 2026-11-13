"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Instagram } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountPublic } from "@/types";
import { t } from "@/lib/i18n";

/**
 * Instagram-аккаунт компании. Одна компания — один аккаунт (второй Instagram — это
 * отдельная компания со своими заявками, знаниями и правилами), поэтому переключателя
 * аккаунтов больше нет: все страницы панели работают с данными своей компании целиком.
 */

const BOT_KEY = "radius.botId"; // «Диалог с ИИ» читает отсюда, с каким аккаунтом говорить

type AccountCtx = {
  accounts: AccountPublic[];
  /** Аккаунт компании (первый подключённый) или null, если Instagram ещё не подключён. */
  account: AccountPublic | null;
  reload: () => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<AccountCtx | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      const json = await res.json();
      const list: AccountPublic[] = (json.data ?? []).sort((a: AccountPublic, b: AccountPublic) => a.created_at.localeCompare(b.created_at));
      setAccounts(list);
      try {
        if (list[0]) window.localStorage.setItem(BOT_KEY, list[0].id);
        else window.localStorage.removeItem(BOT_KEY);
      } catch {
        /* private mode */
      }
    } catch {
      /* статус Instagram в меню — не критично */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<AccountCtx>(() => ({ accounts, account: accounts[0] ?? null, reload, ready }), [accounts, reload, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Аккаунт компании; вне панели руководителя (CRM, супер-админ) — null. */
export function useAccountFilter() {
  return useContext(Ctx);
}

/**
 * Фильтр по аккаунту для запросов к API. Аккаунт у компании один, данные и так
 * разделены по компаниям на сервере — фильтра нет.
 */
export function useAccountId(): string | null {
  return null;
}

/** Внизу бокового меню: какой Instagram подключён, или кнопка «Подключить». */
export function InstagramStatus({ onNavigate }: { onNavigate?: () => void }) {
  const ctx = useAccountFilter();
  if (!ctx?.ready) return null;
  const account = ctx.account;
  const ok = account?.status === "connected";

  return (
    <Link
      href={account ? "/accounts" : "/accounts?add=1"}
      onClick={onNavigate}
      className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl border border-slate-200 px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
          account ? "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]" : "border border-dashed border-slate-300 text-slate-400"
        )}
      >
        <Instagram className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-xs font-medium text-slate-800">{account ? account.account_name : t("Подключить Instagram")}</span>
        <span className={cn("block truncate text-[11px]", !account ? "text-slate-400" : ok ? "text-emerald-600" : "text-red-500")}>
          {!account ? t("ИИ начнёт отвечать клиентам") : ok ? t("Подключён") : t("Нужно переподключить")}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}
