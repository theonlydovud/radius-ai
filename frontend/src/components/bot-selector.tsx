"use client";

import { useAccountFilter } from "@/components/account-switcher";
import type { AccountPublic } from "@/types";

/**
 * Чьи «Знания» и «Правила» открыты. У компании один Instagram-аккаунт, поэтому выбора нет:
 * это всегда её аккаунт (или его агент, если аккаунт берёт знания у другого).
 */
export function useSelectedBot(): { bots: AccountPublic[]; botId: string | null; ready: boolean } {
  const ctx = useAccountFilter();
  const account = ctx?.account ?? null;
  return {
    bots: account ? [account] : [],
    botId: account ? account.knowledge_source_id ?? account.id : null,
    ready: ctx?.ready ?? false,
  };
}
