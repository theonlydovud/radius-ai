"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

/**
 * Тарифы для лендинга и регистрации. Источник правды — таблица plans на сервере (/api/plans);
 * здесь те же значения, чтобы страница рисовалась сразу, без ожидания запроса.
 */

export type PlanFeature = "manual_leads" | "chat_history" | "stats" | "lead_transfer" | "assistant";
export type PublicPlan = {
  code: string;
  name: string;
  price: number;
  instagram_accounts: number;
  users_included: number;
  extra_user_price: number | null;
  messages_limit: number;
  features: Record<PlanFeature, boolean>;
};

const f = (m: boolean, c: boolean, s: boolean, l: boolean, a: boolean) => ({ manual_leads: m, chat_history: c, stats: s, lead_transfer: l, assistant: a });

export const DEFAULT_PLANS: PublicPlan[] = [
  { code: "start", name: "Start", price: 120_000, instagram_accounts: 1, users_included: 1, extra_user_price: null, messages_limit: 3000, features: f(false, false, false, false, false) },
  { code: "business", name: "Business", price: 250_000, instagram_accounts: 1, users_included: 3, extra_user_price: 50_000, messages_limit: 6000, features: f(true, true, true, true, false) },
  { code: "pro", name: "Pro", price: 400_000, instagram_accounts: 1, users_included: 6, extra_user_price: 50_000, messages_limit: 10_000, features: f(true, true, true, true, true) },
];

/** Тариф, который советуем по умолчанию. */
export const POPULAR_PLAN = "business";

export function usePlans() {
  const [plans, setPlans] = useState<PublicPlan[]>(DEFAULT_PLANS);
  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.data) && j.data.length) setPlans(j.data);
      })
      .catch(() => {});
  }, []);
  return plans;
}

/** Строки тарифа для карточки: что входит (ok) и чего нет. */
export function planLines(p: PublicPlan, fmt: Intl.NumberFormat) {
  return [
    { ok: true, text: t("{0} сообщений бота в месяц", fmt.format(p.messages_limit)) },
    { ok: true, text: p.users_included === 1 ? t("1 пользователь") : t("{0} пользователя", p.users_included) },
    { ok: true, text: t("1 Instagram-аккаунт") },
    { ok: true, text: t("Заявки, правила и база знаний") },
    { ok: p.features.manual_leads, text: t("Ручное создание заявок") },
    { ok: p.features.chat_history, text: t("История чатов и перехват диалога") },
    { ok: p.features.stats, text: t("Статистика и конверсия") },
    { ok: p.features.lead_transfer, text: t("Менеджеры и передача заявок") },
    { ok: p.features.assistant, text: t("ИИ-ассистент: текст и голос") },
    ...(p.extra_user_price ? [{ ok: true, text: t("Доп. пользователь — {0} сум", fmt.format(p.extra_user_price)) }] : []),
  ];
}
