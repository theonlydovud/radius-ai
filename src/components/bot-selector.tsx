"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountPublic } from "@/types";

const STORAGE_KEY = "radius.botId";

/**
 * Контекст «текущего бота». Источник правды по приоритету:
 *   1) ?bot_id=... в URL (можно делиться ссылкой),
 *   2) localStorage (запоминается между вкладками/визитами),
 *   3) первый аккаунт из списка.
 * Выбор синхронизируется обратно и в URL, и в localStorage.
 */
export function useSelectedBot() {
  const [bots, setBots] = useState<AccountPublic[]>([]);
  const [botId, setBotIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const persist = useCallback((id: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private mode */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("bot_id", id);
    window.history.replaceState(null, "", url.toString());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const list: AccountPublic[] = json.data ?? [];
        // В списке — от старых к новым: первым остаётся первый (исходный) аккаунт.
        list.sort((a, b) => a.created_at.localeCompare(b.created_at));
        setBots(list);

        const fromUrl = new URLSearchParams(window.location.search).get("bot_id");
        let fromStorage: string | null = null;
        try {
          fromStorage = window.localStorage.getItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        const pick = [fromUrl, fromStorage].find((id) => id && list.some((b) => b.id === id)) ?? list[0]?.id ?? null;
        if (pick) {
          setBotIdState(pick);
          persist(pick);
        }
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const setBotId = useCallback(
    (id: string) => {
      setBotIdState(id);
      persist(id);
    },
    [persist]
  );

  return { bots, botId, setBotId, ready };
}

export function BotSelector({
  bots,
  botId,
  onChange,
}: {
  bots: AccountPublic[];
  botId: string | null;
  onChange: (id: string) => void;
}) {
  if (bots.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <Bot className="h-4 w-4 text-slate-400" />
      <Select value={botId ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-64">
          <SelectValue placeholder="Выберите бота" />
        </SelectTrigger>
        <SelectContent>
          {bots.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.account_name} · {b.platform === "telegram" ? "Telegram" : "Instagram"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
