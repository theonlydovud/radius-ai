"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AccountPublic } from "@/types";

/**
 * Instagram-аккаунты компании. У обычной компании он один; у наших (Radius) их может быть
 * несколько — тогда в «Знаниях», «Правилах» и «Диалоге с ИИ» появляется выбор аккаунта
 * (у каждого свои знания и правила). Заявки, статистика и история показываются по всей компании.
 * Управление аккаунтами — в «Настройках».
 */

const KEY = "dexa.account";
const BOT_KEY = "radius.botId"; // «Диалог с ИИ» читает отсюда, с каким аккаунтом говорить

type AccountCtx = {
  accounts: AccountPublic[];
  /** Выбранный аккаунт (для знаний/правил/песочницы) или null, если Instagram ещё не подключён. */
  account: AccountPublic | null;
  select: (id: string) => void;
  reload: () => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<AccountCtx | null>(null);

function store(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback((id: string | null, list: AccountPublic[]) => {
    const acc = list.find((a) => a.id === id) ?? list[0] ?? null;
    setSelected(acc?.id ?? null);
    store(KEY, acc?.id ?? null);
    // Знания и правила лежат у агента: у аккаунта, подключённого к другому, — у источника.
    store(BOT_KEY, acc ? acc.knowledge_source_id ?? acc.id : null);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts", { cache: "no-store" });
      const json = await res.json();
      const list: AccountPublic[] = (json.data ?? []).sort((a: AccountPublic, b: AccountPublic) => a.created_at.localeCompare(b.created_at));
      setAccounts(list);
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      apply(stored, list);
    } catch {
      /* без списка аккаунтов страницы просто попросят подключить Instagram */
    } finally {
      setReady(true);
    }
  }, [apply]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<AccountCtx>(
    () => ({
      accounts,
      account: accounts.find((a) => a.id === selected) ?? accounts[0] ?? null,
      select: (id: string) => apply(id, accounts),
      reload,
      ready,
    }),
    [accounts, selected, apply, reload, ready]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Аккаунты компании; вне панели руководителя (CRM, супер-админ) — null. */
export function useAccountFilter() {
  return useContext(Ctx);
}

/**
 * Фильтр по аккаунту для заявок, статистики и истории: его нет — показываем всю компанию
 * (данные и так разделены по компаниям на сервере).
 */
export function useAccountId(): string | null {
  return null;
}
