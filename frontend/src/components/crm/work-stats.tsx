"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { companyTerms, lostReasonLabel, managerOne, money } from "@/lib/lead-meta";
import type { LostReason, RouteWork, WorkRow } from "@/types";
import { t } from "@/lib/i18n";

/**
 * Контроль работы с заявками: по каждому логисту и по направлениям.
 * Маржа приходит только руководителю (у логиста её в ответе нет — колонка не рисуется).
 */

/** «45 мин», «3,5 ч», «2 дн.» */
function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return t("{0} мин", Math.round(minutes));
  if (minutes < 60 * 48) return t("{0} ч", Math.round((minutes / 60) * 10) / 10);
  return t("{0} дн.", Math.round((minutes / 1440) * 10) / 10);
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function Margin({ margin }: { margin?: WorkRow["margin"] }) {
  const entries = Object.entries(margin ?? {});
  if (!entries.length) return <>—</>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {entries.map(([cur, m]) => (
        <span key={cur} className="whitespace-nowrap">
          {money(m.sum, cur)} <span className="text-slate-400">({t("ср.")} {money(m.avg)})</span>
        </span>
      ))}
    </span>
  );
}

function LostList({ lost }: { lost: WorkRow["lost"] }) {
  const entries = Object.entries(lost).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  if (!entries.length) return <>—</>;
  return (
    <span className="flex flex-col items-end gap-0.5 text-xs">
      {entries.map(([r, n]) => (
        <span key={r} className="whitespace-nowrap">
          {lostReasonLabel(r as LostReason)}: {n}
        </span>
      ))}
    </span>
  );
}

export function WorkStats({ logists, routes }: { logists: WorkRow[]; routes: RouteWork[] }) {
  const showMargin = logists.some((l) => l.margin !== undefined);
  // Сотрудник один — сравнивать некого; маршруты бывают только у грузовых заявок.
  if (logists.length === 0 && routes.length === 0) return null;
  const rate = companyTerms().amount === "rate";
  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{companyTerms().manager === "logist" ? t("Работа логистов") : t("Работа сотрудников")}</CardTitle>
          <CardDescription>{rate ? t("Как быстро берут заявки, предлагают ставку и закрывают сделки") : t("Как быстро берут заявки, отправляют предложение и закрывают сделки")}</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {logists.length === 0 ? (
            <p className="text-sm text-slate-400">{t("Пока пусто.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500">
                    <th className="pb-2 text-left font-medium">{managerOne()}</th>
                    <th className="pb-2 font-medium">{t("Взято")}</th>
                    <th className="pb-2 font-medium">{t("Назначение → взял")}</th>
                    <th className="pb-2 font-medium">{rate ? t("Взял → ставка") : t("Взял → предложение")}</th>
                    <th className="pb-2 font-medium">{rate ? t("Со ставкой") : t("С предложением")}</th>
                    <th className="pb-2 font-medium">{rate ? t("Заявки → ставка → продано") : t("Заявки → предложение → продано")}</th>
                    <th className="pb-2 font-medium">{t("Продано")}</th>
                    {showMargin && <th className="pb-2 font-medium">{t("Маржа")}</th>}
                    <th className="pb-2 font-medium">{t("Не продано")}</th>
                    <th className="pb-2 font-medium">{t("Просрочено")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logists.map((l) => (
                    <tr key={l.id ?? l.name} className="border-t border-slate-100 align-top tabular-nums text-right text-slate-900">
                      <td className="py-2.5 pr-2 text-left text-slate-700">{l.name}</td>
                      <td className="py-2.5">{l.taken}</td>
                      <td className="py-2.5">{duration(l.avg_take_minutes)}</td>
                      <td className="py-2.5">{duration(l.avg_offer_minutes)}</td>
                      <td className="py-2.5">{pct(l.offer_percent)}</td>
                      <td className="py-2.5 whitespace-nowrap">
                        {l.funnel.leads} → {l.funnel.offered} → {l.funnel.sold}
                      </td>
                      <td className="py-2.5">{l.sold}</td>
                      {showMargin && (
                        <td className="py-2.5">
                          <Margin margin={l.margin} />
                        </td>
                      )}
                      <td className="py-2.5">
                        <LostList lost={l.lost} />
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-xs">
                        {l.overdue.no_offer + l.overdue.stuck === 0 ? (
                          "—"
                        ) : (
                          <span className="text-red-600">
                            {rate ? t("нет ставки") : t("нет предложения")}: {l.overdue.no_offer} · {t("зависли")}: {l.overdue.stuck}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {routes.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("По направлениям")}</CardTitle>
            <CardDescription>{t("Откуда → куда: сколько заявок, со ставкой, продано и почему отказывают")}</CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500">
                    <th className="pb-2 text-left font-medium">{t("Направление")}</th>
                    <th className="pb-2 font-medium">{t("Заявок")}</th>
                    <th className="pb-2 font-medium">{rate ? t("Со ставкой") : t("С предложением")}</th>
                    <th className="pb-2 font-medium">{t("Продано")}</th>
                    <th className="pb-2 font-medium">{t("Конверсия")}</th>
                    <th className="pb-2 font-medium">{t("Топ причина отказа")}</th>
                    <th className="pb-2 font-medium">{t("«Дорого»: наша ставка / цена клиента")}</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.route} className="border-t border-slate-100 align-top tabular-nums text-right text-slate-900">
                      <td className="py-2.5 pr-2 text-left text-slate-700">{r.route}</td>
                      <td className="py-2.5">{r.leads}</td>
                      <td className="py-2.5">{r.offered}</td>
                      <td className="py-2.5">{r.sold}</td>
                      <td className="py-2.5 font-medium">{pct(r.conversion)}</td>
                      <td className="py-2.5 text-xs">{r.top_reason ? lostReasonLabel(r.top_reason) : "—"}</td>
                      <td className="py-2.5 text-xs">
                        {r.too_expensive.length
                          ? r.too_expensive.map((x) => (
                              <span key={x.currency} className="block whitespace-nowrap">
                                {money(x.our_avg, x.currency)} / {money(x.client_avg, x.currency)}
                              </span>
                            ))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
