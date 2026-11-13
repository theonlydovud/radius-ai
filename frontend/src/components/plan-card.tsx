"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useCurrentUser, type Feature } from "@/components/current-user";
import { t, locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Тариф и остаток сообщений внизу меню. У наших компаний (unlimited) не показывается. */
export function PlanCard({ onNavigate }: { onNavigate?: () => void }) {
  const { company } = useCurrentUser();
  if (company.unlimited || !company.plan || !company.usage) return null;
  const { messages_used, messages_limit, period_end } = company.usage;
  const pct = messages_limit ? Math.min(100, Math.round((messages_used / messages_limit) * 100)) : 0;
  const tone = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand";
  const fmt = new Intl.NumberFormat(locale());

  return (
    <Link href="/cabinet" onClick={onNavigate} className="mx-3 mb-2 block rounded-xl border border-slate-200 px-3 py-2.5 transition-colors hover:bg-slate-50">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-800">
          {t("Тариф {0}", company.plan.name)}
          {company.status === "trial" && <span className="ml-1 font-normal text-brand">· {t("пробный")}</span>}
        </span>
        {period_end && <span className="text-slate-400">{t("до {0}", new Date(period_end).toLocaleDateString(locale()))}</span>}
      </div>
      {messages_limit !== null && (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
          </div>
          <p className={cn("mt-1 text-[11px]", pct >= 95 ? "text-red-600" : "text-slate-500")}>
            {t("Сообщения: {0} / {1}", fmt.format(messages_used), fmt.format(messages_limit))}
          </p>
        </>
      )}
    </Link>
  );
}

const FEATURE_TITLE: Record<Feature, string> = {
  manual_leads: "Ручное создание заявок",
  chat_history: "История чатов и перехват диалога",
  stats: "Статистика",
  lead_transfer: "Менеджеры и передача заявок",
  assistant: "ИИ-ассистент",
};

/** Заглушка вместо страницы, закрытой тарифом (сервер её данные тоже не отдаёт). */
export function PlanLocked({ feature }: { feature: Feature }) {
  const { company } = useCurrentUser();
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-surface p-8 text-center shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Lock className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{t(FEATURE_TITLE[feature])}</h2>
      <p className="mt-2 text-sm text-slate-500">
        {t("Недоступно на тарифе {0}. Перейдите на тариф выше — функция откроется сразу.", company.plan?.name ?? "")}
      </p>
      <Link href="/cabinet" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90">
        {t("Сменить тариф")}
      </Link>
    </div>
  );
}
