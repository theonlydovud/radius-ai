"use client";

import { useCallback, useEffect, useState } from "react";
import { DailyOutcomeChart, RankedBars, SERIES, StatusSplit } from "@/components/crm/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lostReasonLabel } from "@/lib/lead-meta";
import { cn, dayEndISO, dayStartISO, toDateInput } from "@/lib/utils";
import type { LeadStats } from "@/types";
import { t } from "@/lib/i18n";

/**
 * Показатели и графики за период. Какие заявки считать, решает backend по роли:
 * менеджеру — только его, супер-админу — все. showManagers добавляет таблицу по менеджерам.
 * Обновляется сама раз в 30 с и при смене refreshKey (кнопка «Обновить», действие с заявкой).
 */

const REFRESH_MS = 30_000;

type Period = "today" | "week" | "month" | "custom";
const PERIODS: { value: Period; label: string; days?: number }[] = [
  { value: "today", get label() { return t("Сегодня"); }, days: 0 },
  { value: "week", get label() { return t("7 дней"); }, days: 6 },
  { value: "month", get label() { return t("30 дней"); }, days: 29 },
  { value: "custom", get label() { return t("Свой период"); } },
];

/** «12.10.2026» из «2026-10-12». */
function ruDate(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

function Tile({ label, value, hint, color, accent }: { label: string; value: string | number; hint?: string; color?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-surface p-4 shadow-sm", accent ? "border-[#eda100]/50 ring-1 ring-[#eda100]/30" : "border-slate-200")}>
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
  const [customFrom, setCustomFrom] = useState(daysAgo(29));
  const [customTo, setCustomTo] = useState(daysAgo(0));
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [error, setError] = useState("");

  const preset = PERIODS.find((p) => p.value === period)!;
  const from = period === "custom" ? customFrom : daysAgo(preset.days ?? 0);
  const to = period === "custom" ? customTo : daysAgo(0);
  const badRange = !from || !to || from > to;

  const load = useCallback(async () => {
    if (badRange) return;
    const params = new URLSearchParams({
      from: dayStartISO(from),
      to: dayEndISO(to),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    try {
      const res = await fetch(`/api/leads/stats?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStats(json.data);
      setError("");
    } catch (e: any) {
      setError(e?.message || t("Не удалось загрузить показатели."));
    }
  }, [from, to, badRange]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const periodLabel =
    period === "custom" ? (from === to ? ruDate(from) : t("период {0} — {1}", ruDate(from), ruDate(to))) : preset.label.toLowerCase();
  const reasons = (stats?.reasons ?? []).filter((r) => r.count > 0).map((r) => ({ label: lostReasonLabel(r.reason), count: r.count, percent: r.percent }));
  const routes = (stats?.routes ?? []).map((r) => ({ label: r.route, count: r.count }));

  return (
    <section className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{t("Заявки, полученные за")}{" "}{periodLabel}.</p>
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

      {period === "custom" && (
        <div className="mt-3 flex flex-wrap items-end justify-end gap-2">
          <div className="space-y-1">
            <label htmlFor="stats-from" className="text-xs text-slate-500">{t("С")}</label>
            <Input id="stats-from" type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <label htmlFor="stats-to" className="text-xs text-slate-500">{t("По")}</label>
            <Input id="stats-to" type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-40" />
          </div>
        </div>
      )}
      {badRange && <p className="mt-2 text-right text-xs text-red-600">{t("Дата «с» должна быть не позже даты «по».")}</p>}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!stats ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface/70" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label={t("Получено")} value={stats.totals.total} />
            <Tile label={t("Новые")} value={stats.totals.new} color={SERIES.new.color} accent={stats.totals.new > 0} />
            <Tile label={t("В работе")} value={stats.totals.in_progress} color={SERIES.in_progress.color} />
            <Tile label={t("Продано")} value={stats.totals.sold} color={SERIES.sold.color} />
            <Tile label={t("Не продано")} value={stats.totals.not_sold} color={SERIES.not_sold.color} />
            <Tile label={t("Конверсия")} value={conversion(stats.totals.conversion)} hint={t("продано / закрытые")} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("Заявки по дням")}</CardTitle>
                <CardDescription>{t("Высота — сколько пришло, цвет — чем закончились")}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {stats.totals.total === 0 ? <p className="text-sm text-slate-400">{t("За этот период заявок нет.")}</p> : <DailyOutcomeChart daily={stats.daily} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Итоги периода")}</CardTitle>
                <CardDescription>{splitHint}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {stats.totals.total === 0 ? <p className="text-sm text-slate-400">{t("Пока пусто.")}</p> : <StatusSplit totals={stats.totals} />}
              </CardContent>
            </Card>
          </div>

          {showManagers && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>{t("Менеджеры")}</CardTitle>
                <CardDescription>{t("Сколько заявок получил каждый и чем они закончились")}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="pb-2 font-medium">{t("Менеджер")}</th>
                        <th className="pb-2 text-right font-medium">{t("Получил")}</th>
                        <th className="pb-2 text-right font-medium">{t("Продал")}</th>
                        <th className="pb-2 text-right font-medium">{t("Не продал")}</th>
                        <th className="pb-2 text-right font-medium">{t("Конверсия")}</th>
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
                <CardTitle>{t("Причины отказа")}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <RankedBars rows={reasons} empty={t("Отказов за этот период нет.")} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Направления")}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <RankedBars rows={routes} empty={t("Направлений пока нет.")} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
