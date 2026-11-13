"use client";

import { Instagram } from "lucide-react";
import { useAccountFilter } from "@/components/account-switcher";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountPublic } from "@/types";

/**
 * Чьи «Знания» и «Правила» открыты: выбранный Instagram-аккаунт компании (или его агент,
 * если аккаунт берёт знания у другого). У обычной компании аккаунт один — выбора нет.
 */
export function useSelectedBot(): { bots: AccountPublic[]; botId: string | null; ready: boolean } {
  const ctx = useAccountFilter();
  const account = ctx?.account ?? null;
  return {
    bots: ctx?.accounts ?? [],
    botId: account ? account.knowledge_source_id ?? account.id : null,
    ready: ctx?.ready ?? false,
  };
}

/** Выбор аккаунта — только когда их больше одного (у наших компаний). */
export function AccountPicker() {
  const ctx = useAccountFilter();
  if (!ctx || ctx.accounts.length < 2) return null;
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Instagram className="h-4 w-4 text-slate-400" />
      <Select value={ctx.account?.id} onValueChange={ctx.select}>
        <SelectTrigger className="h-9 w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ctx.accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.account_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
