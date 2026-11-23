"use client";

import { Suspense } from "react";
import { PartnersList } from "@/components/partners-list";
import { useCurrentUser } from "@/components/current-user";
import { partnersOn, partnersTitle } from "@/lib/lead-meta";
import { t } from "@/lib/i18n";

/** База партнёров (у Radius — «Водители»). Модуль включается в «Настройках» → «Воронка». */
export default function PartnersPage() {
  const { company } = useCurrentUser();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">{partnersTitle()}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {company.lead_kind === "cargo"
            ? t("Водители, которые ищут груз для своей машины. Бот отправляет их в группу без ответственного — в заявки и статистику они не попадают.")
            : t("Кто сам предлагает компании товары или услуги. В заявки и статистику они не попадают.")}
        </p>
      </div>
      {!partnersOn() && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t("Приём контактов партнёров выключен — включите его в «Настройках» → «Воронка».")}</p>
      )}
      <Suspense>
        <PartnersList canConvert />
      </Suspense>
    </div>
  );
}
