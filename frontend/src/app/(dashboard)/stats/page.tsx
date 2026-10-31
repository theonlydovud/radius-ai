"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyLeadsChart } from "@/components/daily-leads-chart";
import { lostReasonLabel } from "@/lib/lead-meta";
import { dayEndISO, dayStartISO, toDateInput } from "@/lib/utils";
import type { LeadStats } from "@/types";

type Period = "today" | "week" | "month" | "custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "custom", label: "Свой период" },
];

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

const PRESET_DAYS: Record<Exclude<Period, "custom">, number> = { today: 0, week: 6, month: 29 };

function formatConversion(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
}

/** Строка «название — количество — %» с тонкой полосой величины. */
function ShareRow({ label, count, percent, width }: { label: string; count: number; percent?: number; width: number }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words text-slate-700">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-900">
          {count}
          {percent !== undefined && <span className="ml-1.5 text-xs text-slate-400">{percent}%</span>}
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-100">
        <div className="h-1 rounded-full" style={{ width: `${width}%`, background: "#2a78d6" }} />
      </div>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400">{text}</p>;
}

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(daysAgo(29));
  const [customTo, setCustomTo] = useState(daysAgo(0));
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [error, setError] = useState("");

  const from = period === "custom" ? customFrom : daysAgo(PRESET_DAYS[period]);
  const to = period === "custom" ? customTo : daysAgo(0);

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    const params = new URLSearchParams({
      from: dayStartISO(from),
      to: dayEndISO(to),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    fetch(`/api/leads/stats?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        return json.data as LeadStats;
      })
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setError("");
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Не удалось загрузить статистику.");
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const maxReason = Math.max(1, ...(stats?.reasons.map((r) => r.count) ?? []));
  const maxRoute = Math.max(1, ...(stats?.routes.map((r) => r.count) ?? []));
  const reasonsWithData = stats?.reasons.filter((r) => r.count > 0) ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Статистика</h1>
        <p className="mt-1 text-sm text-slate-500">Считаются заявки, созданные за выбранный период.</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="flex w-full sm:inline-flex sm:w-auto">
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value} className="flex-1 px-2 sm:flex-none sm:px-3">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">С</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">По</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9" />
            </div>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!stats ? (
        !error && <p className="text-sm text-slate-400">Загрузка...</p>
      ) : stats.totals.total === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <BarChart3 className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">За этот период заявок нет.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Всего заявок" value={stats.totals.total} />
            <Tile label="Новые" value={stats.totals.new} />
            <Tile label="В работе" value={stats.totals.in_progress} />
            <Tile label="Продано" value={stats.totals.sold} />
            <Tile label="Не продано" value={stats.totals.not_sold} />
            <Tile label="Конверсия" value={formatConversion(stats.totals.conversion)} hint="продано / закрытые" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Заявки по дням</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyLeadsChart daily={stats.daily} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Менеджеры</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
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
                      <tr key={m.id ?? "none"} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-slate-700">{m.name}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">{m.received}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">{m.sold}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">{m.not_sold}</td>
                        <td className="py-2 text-right tabular-nums text-slate-900">{formatConversion(m.conversion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Причины отказа</CardTitle>
              </CardHeader>
              <CardContent>
                {reasonsWithData.length === 0 ? (
                  <Empty text="Отказов за этот период нет." />
                ) : (
                  <ul className="space-y-3">
                    {reasonsWithData.map((r) => (
                      <ShareRow
                        key={r.reason}
                        label={lostReasonLabel(r.reason)}
                        count={r.count}
                        percent={r.percent}
                        width={(r.count / maxReason) * 100}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Источник</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {stats.sources.map((s) => (
                    <ShareRow
                      key={s.platform}
                      label={s.platform === "telegram" ? "Telegram" : "Instagram"}
                      count={s.count}
                      percent={s.percent}
                      width={s.percent}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Топ направлений</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.routes.length === 0 ? (
                  <Empty text="Направлений пока нет." />
                ) : (
                  <ul className="space-y-3">
                    {stats.routes.map((r) => (
                      <ShareRow key={r.route} label={r.route} count={r.count} width={(r.count / maxRoute) * 100} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
