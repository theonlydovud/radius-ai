"use client";

import { KeyRound } from "lucide-react";
import { useCurrentUser } from "@/components/current-user";
import { LANDING_HOST } from "@/lib/workspace";

/** Плашка «режим владельца платформы»: видна только владельцу DexaAI, внутри чужой компании. */
export function PlatformBanner() {
  const { user, company } = useCurrentUser();
  if (!user.platform) return null;

  async function switchCompany() {
    await fetch("/api/platform/exit", { method: "POST" }).catch(() => {});
    const onDexa = window.location.hostname.endsWith(LANDING_HOST);
    window.location.href = onDexa ? `${window.location.protocol}//${LANDING_HOST}/platform?tab=companies` : "/platform?tab=companies";
  }

  return (
    <div className="flex items-center gap-3 bg-[#121318] px-4 py-2 text-xs text-white md:px-8">
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#A79FFF]" />
      <span className="min-w-0 flex-1 truncate">
        Режим владельца DexaAI · <b>{company.name}</b>
        {user.asUser ? <> · от лица <b>{user.asUser}</b></> : null} · сотрудники вас не видят
      </span>
      <button type="button" onClick={switchCompany} className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20">
        Сменить компанию
      </button>
    </div>
  );
}
