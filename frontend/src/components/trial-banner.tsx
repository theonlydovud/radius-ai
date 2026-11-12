"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { trialDaysLeft, useCurrentUser } from "@/components/current-user";
import { t } from "@/lib/i18n";

/** Полоса над панелью на пробном периоде: сколько дней осталось и куда нажать, чтобы подключиться. */
export function TrialBanner() {
  const { company } = useCurrentUser();
  const days = trialDaysLeft(company);
  if (days === null) return null;
  const urgent = days <= 3;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5 text-sm md:px-8 ${
        urgent ? "border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" : "border-brand/15 bg-brand/5 text-slate-700"
      }`}
    >
      <Sparkles className={`h-4 w-4 shrink-0 ${urgent ? "text-amber-500" : "text-brand"}`} />
      <span className="min-w-0 flex-1">
        {days === 0 ? t("Пробный период заканчивается сегодня.") : t("Пробный период: осталось {0} дн. Всё работает без ограничений.", days)}
      </span>
      <Link href="/cabinet" className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90">
        {t("Подключить навсегда")}
      </Link>
    </div>
  );
}
