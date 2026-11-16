"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useCurrentUser } from "@/components/current-user";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * «Подключить Telegram»: сотрудник жмёт Start у бота DexaAI, и туда начинают приходить
 * напоминания по его заявкам (новая заявка, не взята, нет ставки, висит, следующий контакт).
 */
export function TelegramLinkButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { user } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState("");

  if (user.telegramLinked) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-emerald-600", className)} title={t("Напоминания по заявкам приходят в Telegram")}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        {!compact && t("Telegram подключён")}
      </span>
    );
  }

  async function connect() {
    setBusy(true);
    setError("");
    // Окно — сразу по клику, иначе браузер заблокирует его как всплывающее.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch("/api/profile/telegram", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("Не удалось получить ссылку."));
      if (tab) tab.location.href = j.data.url;
      else window.location.href = j.data.url;
      setOpened(true);
    } catch (e: any) {
      tab?.close();
      setError(e?.message ?? t("Не удалось получить ссылку."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn("inline-flex flex-col", className)}>
      <button
        type="button"
        onClick={opened ? () => window.location.reload() : connect}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#2AABEE]/40 bg-[#2AABEE]/10 px-2.5 py-1.5 text-xs font-medium text-[#1a8fd0] hover:bg-[#2AABEE]/20"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {opened ? t("Нажали Start? Обновить") : t("Подключить Telegram")}
      </button>
      {error && <span className="mt-1 text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
