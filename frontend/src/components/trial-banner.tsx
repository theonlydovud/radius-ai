"use client";

import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { trialDaysLeft, useCurrentUser } from "@/components/current-user";
import { t } from "@/lib/i18n";

/**
 * Полоса над панелью:
 *   бот остановлен (кончились сообщения или оплаченный период) — красная, «Продлить»;
 *   пробный период — сколько дней осталось и на каком тарифе.
 */
export function TrialBanner() {
  const { company } = useCurrentUser();
  if (company.unlimited) return null;

  if (company.ai_blocked) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 md:px-8">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
        <span className="min-w-0 flex-1">
          {company.ai_blocked === "limit"
            ? t("Сообщения тарифа закончились — ИИ не отвечает клиентам. Продлите тариф, чтобы бот снова заработал.")
            : t("Оплаченный период закончился — ИИ не отвечает клиентам. Продлите тариф, чтобы бот снова заработал.")}
        </span>
        <Link href="/cabinet" className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          {t("Продлить")}
        </Link>
      </div>
    );
  }

  const days = trialDaysLeft(company);
  if (days === null) return null;
  const urgent = days <= 3;
  const plan = company.plan?.name ?? "";

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5 text-sm md:px-8 ${
        urgent ? "border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" : "border-brand/15 bg-brand/5 text-slate-700"
      }`}
    >
      <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? "text-amber-500" : "text-brand"}`} />
      <span className="min-w-0 flex-1">
        {days === 0 ? t("Пробный период тарифа {0} заканчивается сегодня.", plan) : t("Пробный период тарифа {0}: осталось {1} дн.", plan, days)}
      </span>
      <Link href="/cabinet" className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90">
        {t("Подключить навсегда")}
      </Link>
    </div>
  );
}
