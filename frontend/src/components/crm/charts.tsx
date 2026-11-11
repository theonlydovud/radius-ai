"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { t as tr } from "@/lib/i18n";

/**
 * Графики CRM. Цвета — первые слоты проверенной категориальной палитры (валидатор:
 * CVD ΔE ≥ 9.2 для всех пар). Жёлтый и бирюзовый светлее 3:1 к фону, поэтому у каждого
 * графика есть подписи/легенда с числами и таблица — цвет никогда не единственный носитель.
 */
export const SERIES = {
  new: { color: "var(--series-new)", get label() { return tr("Новые"); } },
  in_progress: { color: "var(--series-blue)", get label() { return tr("В работе"); } },
  open: { color: "var(--series-blue)", get label() { return tr("Открытые"); } },
  sold: { color: "var(--series-sold)", get label() { return tr("Продано"); } },
  not_sold: { color: "var(--series-lost)", get label() { return tr("Не продано"); } },
} as const;

const GRID = "rgb(var(--slate-200))";

function formatDay(date: string) {
  const [, month, day] = date.split("-");
  return `${day}.${month}`;
}

/** Верх оси — круглое число: 1, 2, 5, 10, 20, 50… */
function niceTop(max: number) {
  if (max <= 1) return 1;
  const base = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((s) => s * base >= max) ?? 10;
  return step * base;
}

function Legend({ keys }: { keys: (keyof typeof SERIES)[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {keys.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[k].color }} />
          {SERIES[k].label}
        </li>
      ))}
    </ul>
  );
}

type Day = { date: string; count: number; open: number; sold: number; not_sold: number };
const STACK: ("sold" | "not_sold" | "open")[] = ["sold", "not_sold", "open"]; // снизу вверх

/** Заявки по дням: столбик = все заявки дня, разрезанный на итоги. */
export function DailyOutcomeChart({ daily }: { daily: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceTop(Math.max(0, ...daily.map((d) => d.count)));
  const ticks = top > 1 && top % 2 === 0 ? [0, top / 2, top] : [0, top];
  const labelEvery = Math.max(1, Math.ceil(daily.length / 7));
  const hovered = active === null ? null : daily[active];

  return (
    <div>
      <Legend keys={["open", "sold", "not_sold"]} />
      <div className="mt-4 flex gap-2">
        <div className="relative h-48 w-6 shrink-0">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 text-[11px] tabular-nums text-slate-400" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px" style={{ bottom: `${(t / top) * 100}%`, background: GRID }} />
            ))}
            <div className="absolute inset-0 flex gap-[2px]">
              {daily.map((d, i) => {
                const parts = STACK.filter((k) => d[k] > 0);
                return (
                  <button
                    key={d.date}
                    type="button"
                    className="relative flex h-full min-w-0 flex-1 flex-col justify-end focus:outline-none"
                    aria-label={tr("{0}: всего {1}, открытых {2}, продано {3}, не продано {4}", formatDay(d.date), d.count, d.open, d.sold, d.not_sold)}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    <span
                      className={cn("mx-auto flex w-full max-w-[26px] flex-col-reverse gap-[2px] transition-opacity", active !== null && active !== i && "opacity-50")}
                      style={{ height: `${(d.count / top) * 100}%` }}
                    >
                      {parts.map((k, j) => (
                        <span
                          key={k}
                          className={cn("block w-full", j === parts.length - 1 && "rounded-t-[4px]")}
                          style={{ flexGrow: d[k], flexBasis: 0, minHeight: 2, background: SERIES[k].color }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            {hovered && active !== null && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-36 -translate-x-1/2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs shadow-md"
                style={{ left: `${Math.min(85, Math.max(15, ((active + 0.5) / daily.length) * 100))}%` }}
              >
                <p className="font-medium text-slate-900">
                  {formatDay(hovered.date)} · {hovered.count}
                </p>
                {(["open", "sold", "not_sold"] as const).map((k) => (
                  <p key={k} className="mt-0.5 flex items-center justify-between gap-2 text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: SERIES[k].color }} />
                      {SERIES[k].label}
                    </span>
                    <span className="tabular-nums text-slate-900">{hovered[k]}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="mt-1 flex gap-[2px]">
            {daily.map((d, i) => (
              <div key={d.date} className="flex min-w-0 flex-1 justify-center">
                {i % labelEvery === 0 && <span className="whitespace-nowrap text-[11px] text-slate-400">{formatDay(d.date)}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-700">{tr("Таблица по дням")}</summary>
        <div className="thin-scroll mt-2 max-h-48 overflow-y-auto">
          <table className="w-full max-w-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-1 font-normal">{tr("День")}</th>
                <th className="py-1 text-right font-normal">{tr("Всего")}</th>
                <th className="py-1 text-right font-normal">{tr("Открытые")}</th>
                <th className="py-1 text-right font-normal">{tr("Продано")}</th>
                <th className="py-1 text-right font-normal">{tr("Не продано")}</th>
              </tr>
            </thead>
            <tbody>
              {daily.filter((d) => d.count > 0).map((d) => (
                <tr key={d.date} className="border-t border-slate-100 tabular-nums text-slate-900">
                  <td className="py-1 text-slate-600">{formatDay(d.date)}</td>
                  <td className="py-1 text-right">{d.count}</td>
                  <td className="py-1 text-right">{d.open}</td>
                  <td className="py-1 text-right">{d.sold}</td>
                  <td className="py-1 text-right">{d.not_sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Куда ушли заявки периода: одна полоса, каждая часть подписана долей. */
export function StatusSplit({ totals }: { totals: { new: number; in_progress: number; sold: number; not_sold: number; total: number } }) {
  const parts = (["new", "in_progress", "sold", "not_sold"] as const).map((k) => ({ key: k, value: totals[k] }));
  const total = Math.max(1, totals.total);
  return (
    <div>
      <div className="flex h-12 w-full gap-[2px] overflow-hidden rounded-[6px]">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => {
            const share = Math.round((p.value / total) * 100);
            return (
              <div
                key={p.key}
                className="flex min-w-[6px] items-center justify-center text-[11px] font-semibold text-slate-900"
                style={{ flexGrow: p.value, flexBasis: 0, background: SERIES[p.key].color }}
                title={`${SERIES[p.key].label}: ${p.value} (${share}%)`}
              >
                {share >= 12 && <span className="rounded bg-surface/85 px-1 tabular-nums">{share}%</span>}
              </div>
            );
          })}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[p.key].color }} />
              {SERIES[p.key].label}
            </span>
            <span className="tabular-nums font-medium text-slate-900">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ранжированные полосы одного цвета: причины отказа, направления. */
export function RankedBars({ rows, empty }: { rows: { label: string; count: number; percent?: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words text-slate-700">{r.label}</span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {r.count}
              {r.percent !== undefined && <span className="ml-1.5 text-xs text-slate-400">{r.percent}%</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-[var(--series-blue)]" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
