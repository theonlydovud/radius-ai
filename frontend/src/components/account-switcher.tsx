"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Instagram, Layers, Plus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountPublic } from "@/types";

/**
 * Выбранный Instagram-аккаунт в панели руководителя — как переключатель аккаунтов в Instagram.
 * От него зависят заявки, статистика, история чатов, а также знания/правила/диалог с ИИ
 * (через агента аккаунта). Выбор хранится в этом браузере.
 */

export const ALL_ACCOUNTS = "all";
const KEY = "dexa.account";
const BOT_KEY = "radius.botId"; // агент для «Знаний», «Правил» и «Диалога с ИИ»

type AccountCtx = {
  accounts: AccountPublic[];
  /** id аккаунта или ALL_ACCOUNTS */
  selected: string;
  account: AccountPublic | null;
  setSelected: (id: string) => void;
  reload: () => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<AccountCtx | null>(null);

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [selected, setSelectedState] = useState<string>(ALL_ACCOUNTS);
  const [ready, setReady] = useState(false);

  const apply = useCallback((id: string, list: AccountPublic[]) => {
    setSelectedState(id);
    save(KEY, id);
    // «Знания» и «Правила» редактируются у агента: у подключённого аккаунта это его источник.
    const acc = list.find((a) => a.id === id);
    if (acc) save(BOT_KEY, acc.knowledge_source_id ?? acc.id);
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
      const keep = stored === ALL_ACCOUNTS || list.some((a) => a.id === stored) ? stored! : list[0]?.id ?? ALL_ACCOUNTS;
      apply(keep, list);
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
      selected,
      account: accounts.find((a) => a.id === selected) ?? null,
      setSelected: (id: string) => apply(id, accounts),
      reload,
      ready,
    }),
    [accounts, selected, apply, reload, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Контекст аккаунта; вне панели руководителя (CRM, супер-админ) — null, фильтра нет. */
export function useAccountFilter() {
  return useContext(Ctx);
}

/** id для запросов к API: null — все аккаунты. */
export function useAccountId() {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.ready) return ctx ? undefined : null;
  return ctx.selected === ALL_ACCOUNTS ? null : ctx.selected;
}

function Avatar({ name, all }: { name: string; all?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
        all ? "bg-slate-700" : "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]"
      )}
    >
      {all ? <Layers className="h-4 w-4" /> : <span className="text-xs font-semibold">{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

/** Переключатель внизу бокового меню: аккаунты, «Все аккаунты», добавить и управление. */
export function AccountSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const ctx = useAccountFilter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!ctx) return null;
  const { accounts, selected, account, setSelected } = ctx;
  const all = selected === ALL_ACCOUNTS;
  const pick = (id: string) => {
    setSelected(id);
    setOpen(false);
  };

  return (
    <div className="relative px-3 pb-2" ref={ref}>
      {open && (
        <div role="menu" className="absolute bottom-full left-3 right-3 z-50 mb-1 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Аккаунты</p>
          {accounts.map((a) => (
            <button key={a.id} role="menuitemradio" aria-checked={selected === a.id} onClick={() => pick(a.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
              <Avatar name={a.account_name} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{a.account_name}</span>
              {selected === a.id && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
          {accounts.length > 1 && (
            <button role="menuitemradio" aria-checked={all} onClick={() => pick(ALL_ACCOUNTS)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
              <Avatar name="" all />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">Все аккаунты</span>
              {all && <Check className="h-4 w-4 text-brand" />}
            </button>
          )}
          <div className="my-1 h-px bg-slate-100" />
          <Link href="/accounts?add=1" onClick={() => { setOpen(false); onNavigate?.(); }} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium text-brand hover:bg-brand-soft">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-brand/40">
              <Plus className="h-4 w-4" />
            </span>
            Добавить аккаунт
          </Link>
          <Link href="/accounts" onClick={() => { setOpen(false); onNavigate?.(); }} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <span className="flex h-8 w-8 items-center justify-center">
              <Settings2 className="h-4 w-4 text-slate-400" />
            </span>
            Управление аккаунтами
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Сменить Instagram-аккаунт"
        className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-brand/40"
      >
        {accounts.length === 0 ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-slate-300">
              <Instagram className="h-4 w-4 text-slate-400" />
            </span>
            <span className="flex-1 text-sm text-slate-500">Нет аккаунтов</span>
          </>
        ) : (
          <>
            <Avatar name={account?.account_name ?? ""} all={all} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-slate-900">{all ? "Все аккаунты" : account?.account_name}</span>
              <span className="block truncate text-[11px] text-slate-400">{all ? `${accounts.length} Instagram` : "Instagram"}</span>
            </span>
          </>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    </div>
  );
}
