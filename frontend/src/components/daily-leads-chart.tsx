"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Один ряд — один цвет. Значения дублируются в таблице под графиком. */
const BAR_COLOR = "#2a78d6";
const GRID_COLOR = "#e2e8f0";

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

export function DailyLeadsChart({ daily }: { daily: { date: string; count: number }[] }) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(0, ...daily.map((d) => d.count));
  const top = niceTop(max);
  const ticks = top > 1 && top % 2 === 0 ? [0, top / 2, top] : [0, top];
  const peak = daily.findIndex((d) => d.count === max && max > 0);
  const labelEvery = Math.max(1, Math.ceil(daily.length / 6));
  const hovered = active === null ? null : daily[active];

  return (
    <div>
      <div className="flex gap-2">
        {/* Ось Y */}
        <div className="relative h-44 w-6 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 text-[11px] text-slate-400"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-44">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 h-px"
                style={{ bottom: `${(t / top) * 100}%`, background: GRID_COLOR }}
              />
            ))}

            <div className="absolute inset-0 flex gap-[2px]">
              {daily.map((d, i) => {
                const height = (d.count / top) * 100;
                return (
                  <button
                    key={d.date}
                    type="button"
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                    aria-label={`${formatDay(d.date)}: ${d.count}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    {d.count > 0 && (
                      <span
                        className={cn(
                          "block w-full max-w-[24px] rounded-t transition-opacity",
                          active === i ? "opacity-70" : "opacity-100"
                        )}
                        style={{ height: `${height}%`, background: BAR_COLOR }}
                      />
                    )}
                    {i === peak && active === null && (
                      <span
                        className="pointer-events-none absolute text-[11px] font-medium text-slate-700"
                        style={{ bottom: `calc(${height}% + 2px)` }}
                      >
                        {d.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {hovered && active !== null && (
              <div
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm"
                style={{ left: `${Math.min(88, Math.max(12, ((active + 0.5) / daily.length) * 100))}%` }}
              >
                <span className="font-semibold text-slate-900">{hovered.count}</span>{" "}
                <span className="text-slate-500">{formatDay(hovered.date)}</span>
              </div>
            )}
          </div>

          {/* Ось X: подписи выборочно, чтобы не слипались */}
          <div className="mt-1 flex gap-[2px]">
            {daily.map((d, i) => (
              <div key={d.date} className="flex min-w-0 flex-1 justify-center">
                {i % labelEvery === 0 && (
                  <span className="whitespace-nowrap text-[11px] text-slate-400">{formatDay(d.date)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-700">Таблица по дням</summary>
        <div className="thin-scroll mt-2 max-h-48 overflow-y-auto">
          <table className="w-full max-w-xs">
            <tbody>
              {daily.map((d) => (
                <tr key={d.date} className="border-t border-slate-100">
                  <td className="py-1 text-slate-600">{formatDay(d.date)}</td>
                  <td className="py-1 text-right tabular-nums text-slate-900">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
