"use client";

import { useCallback, useEffect, useState } from "react";
import { DailyOutcomeChart, RankedBars, SERIES, StatusSplit } from "@/components/crm/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lostReasonLabel } from "@/lib/lead-meta";
import { cn, dayEndISO, dayStartISO, toDateInput } from "@/lib/utils";
import type { LeadStats } from "@/types";

/**
 * Показатели и графики за период. Какие заявки считать, решает backend по роли:
 * менеджеру — только его, супер-админу — все. showManagers добавляет таблицу по менеджерам.
 * Обновляется сама раз в 30 с и при смене refreshKey (кнопка «Обновить», действие с заявкой).
 */

const REFRESH_MS = 30_000;

type Period = "today" | "week" | "month" | "quarter";
const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "today", label: "Сегодня", days: 0 },
  { value: "week", label: "7 дней", days: 6 },
  { value: "month", label: "30 дней", days: 29 },
  { value: "quarter", label: "90 дней", days: 89 },
];

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

function Tile({ label, value, hint, color, accent }: { label: string; value: string | number; hint?: string; color?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-white p-4 shadow-sm", accent ? "border-[#eda100]/50 ring-1 ring-[#eda100]/30" : "border-slate-200")}>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        {color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const conversion = (v: number | null) => (v === null ? "—" : `${v}%`);

export function StatsSection({
  title,
  splitHint,
  showManagers = false,
  refreshKey = 0,
}: {
  title: string;
  /** Подпись под «Итоги периода». */
  splitHint: string;
  showManagers?: boolean;
  refreshKey?: number;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const days = PERIODS.find((p) => p.value === period)!.days;
    const params = new URLSearchParams({
      from: dayStartISO(daysAgo(days)),
      to: dayEndISO(daysAgo(0)),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    try {
      const res = await fetch(`/api/leads/stats?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStats(json.data);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить показатели.");
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase();
  const reasons = (stats?.reasons ?? []).filter((r) => r.count > 0).map((r) => ({ label: lostReasonLabel(r.reason), count: r.count, percent: r.percent }));
  const routes = (stats?.routes ?? []).map((r) => ({ label: r.route, count: r.count }));

  return (
    <section className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">Заявки, полученные за {periodLabel}.</p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="flex w-full sm:inline-flex sm:w-auto">
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value} className="flex-1 px-2 sm:flex-none sm:px-3">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!stats ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/70" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Получено" value={stats.totals.total} />
            <Tile label="Новые" value={stats.totals.new} color={SERIES.new.color} accent={stats.totals.new > 0} />
            <Tile label="В работе" value={stats.totals.in_progress} color={SERIES.in_progress.color} />
            <Tile label="Продано" value={stats.totals.sold} color={SERIES.sold.color} />
            <Tile label="Не продано" value={stats.totals.not_sold} color={SERIES.not_sold.color} />
            <Tile label="Конверсия" value={conversion(stats.totals.conversion)} hint="продано / закрытые" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Заявки по дням</CardTitle>
                <CardDescription>Высота — сколько пришло, цвет — чем закончились</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {stats.totals.total === 0 ? <p className="text-sm text-slate-400">За этот период заявок нет.</p> : <DailyOutcomeChart daily={stats.daily} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Итоги периода</CardTitle>
                <CardDescription>{splitHint}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {stats.totals.total === 0 ? <p className="text-sm text-slate-400">Пока пусто.</p> : <StatusSplit totals={stats.totals} />}
              </CardContent>
            </Card>
          </div>

          {showManagers && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Менеджеры</CardTitle>
                <CardDescription>Сколько заявок получил каждый и чем они закончились</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="pb-2 font-medium">Менеджер</th>
                        <th className="pb-2 text-right font-medium">Получил</th>
                        <th className="pb-2 text-right font-medium">Продал</th>
                        <th className="pb-2 text-right font-medium">Не продал</th>
                        <th className="pb-2 text-right font-medium">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.managers.map((m) => (
                        <tr key={m.id ?? "none"} className="border-t border-slate-100 tabular-nums">
                          <td className="py-2.5 pr-2 text-slate-700">{m.name}</td>
                          <td className="py-2.5 text-right text-slate-900">{m.received}</td>
                          <td className="py-2.5 text-right text-slate-900">{m.sold}</td>
                          <td className="py-2.5 text-right text-slate-900">{m.not_sold}</td>
                          <td className="py-2.5 text-right font-medium text-slate-900">{conversion(m.conversion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Причины отказа</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <RankedBars rows={reasons} empty="Отказов за этот период нет." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Направления</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <RankedBars rows={routes} empty="Направлений пока нет." />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
