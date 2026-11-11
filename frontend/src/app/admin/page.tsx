"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/components/current-user";
import { StatsSection } from "@/components/crm/stats-section";
import { greeting, TopBar } from "@/components/crm/top-bar";
import { LeadsBoard } from "@/components/leads-board";
import { Button } from "@/components/ui/button";

/**
 * Рабочее место супер-админа: заявки всех менеджеров карточками (как у руководителя)
 * и общая статистика с разбивкой по менеджерам. Больше ничего — знания, правила,
 * аккаунты и настройки ему закрыты и на backend.
 */
export default function AdminPage() {
  const { user } = useCurrentUser();
  // Смена ключа пересоздаёт доску (перезагрузка заявок) и обновляет статистику.
  const [key, setKey] = useState(0);
  const [statsKey, setStatsKey] = useState(0);

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {greeting()}, {user.name.split(/\s+/)[0]}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Заявки всех менеджеров и общая статистика.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-start sm:self-auto"
            onClick={() => {
              setKey((k) => k + 1);
              setStatsKey((k) => k + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </Button>
        </div>

        <LeadsBoard key={key} onChanged={() => setStatsKey((k) => k + 1)} />
        <StatsSection title="Статистика" splitHint="Где сейчас все заявки периода" showManagers refreshKey={statsKey} />
      </main>
    </div>
  );
}
