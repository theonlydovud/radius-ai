"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/components/current-user";
import { StatsSection } from "@/components/crm/stats-section";
import { greeting, TopBar } from "@/components/crm/top-bar";
import { LeadsBoard } from "@/components/leads-board";
import { CreateLeadButton } from "@/components/create-lead-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/**
 * Рабочее место супер-админа: заявки всех менеджеров списком (с фильтрами руководителя)
 * и общая статистика с разбивкой по менеджерам. Больше ничего — знания, правила,
 * аккаунты и настройки ему закрыты и на backend.
 */
export default function AdminPage() {
  const { user } = useCurrentUser();
  // Смена ключа пересоздаёт доску (перезагрузка заявок) и обновляет статистику.
  const [key, setKey] = useState(0);
  const [statsKey, setStatsKey] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {greeting()}, {user.name.split(/\s+/)[0]}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t("Заявки всех менеджеров и общая статистика.")}</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
          <CreateLeadButton
            onCreated={() => {
              setKey((k) => k + 1);
              setStatsKey((k) => k + 1);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setKey((k) => k + 1);
              setStatsKey((k) => k + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("Обновить")}</Button>
          </div>
        </div>

        <LeadsBoard key={key} layout="list" onChanged={() => setStatsKey((k) => k + 1)} />
        <StatsSection title={t("Статистика")} splitHint={t("Где сейчас все заявки периода")} showManagers refreshKey={statsKey} />
      </main>
    </div>
  );
}
