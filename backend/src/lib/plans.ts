import { createAdminClient } from "./supabase/server";

/**
 * Тарифы. Цены, лимиты и флаги функций лежат в таблице plans (migration-plans.sql) —
 * меняются там, без деплоя. Здесь — те же значения на случай, если таблицы ещё нет.
 */

export const FEATURES = ["manual_leads", "chat_history", "stats", "lead_transfer", "assistant"] as const;
export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

export type Plan = {
  code: string;
  name: string;
  price: number;
  instagram_accounts: number;
  users_included: number;
  extra_user_price: number | null;
  messages_limit: number;
  features: Features;
  sort_order: number;
};

const f = (manual_leads: boolean, chat_history: boolean, stats: boolean, lead_transfer: boolean, assistant: boolean): Features => ({
  manual_leads,
  chat_history,
  stats,
  lead_transfer,
  assistant,
});

export const ALL_FEATURES = f(true, true, true, true, true);
export const DEFAULT_PLAN = "business";

const FALLBACK: Plan[] = [
  { code: "start", name: "Start", price: 120_000, instagram_accounts: 1, users_included: 1, extra_user_price: null, messages_limit: 3000, features: f(false, false, false, false, false), sort_order: 1 },
  { code: "business", name: "Business", price: 250_000, instagram_accounts: 1, users_included: 3, extra_user_price: 50_000, messages_limit: 6000, features: f(true, true, true, true, false), sort_order: 2 },
  { code: "pro", name: "Pro", price: 400_000, instagram_accounts: 1, users_included: 6, extra_user_price: 50_000, messages_limit: 10_000, features: ALL_FEATURES, sort_order: 3 },
];

let cache: { at: number; plans: Plan[] } | null = null;
const CACHE_MS = 60_000;

export async function getPlans(): Promise<Plan[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.plans;
  let plans = FALLBACK;
  try {
    const { data, error } = await createAdminClient().from("plans").select("*").order("sort_order", { ascending: true });
    if (!error && data?.length) {
      plans = (data as any[]).map((p) => ({
        code: String(p.code),
        name: String(p.name),
        price: Number(p.price) || 0,
        instagram_accounts: Number(p.instagram_accounts) || 1,
        users_included: Number(p.users_included) || 1,
        extra_user_price: p.extra_user_price == null ? null : Number(p.extra_user_price),
        messages_limit: Number(p.messages_limit) || 0,
        features: Object.fromEntries(FEATURES.map((k) => [k, p.features?.[k] === true])) as Features,
        sort_order: Number(p.sort_order) || 0,
      }));
    }
  } catch {
    /* таблицы ещё нет — работаем на значениях по умолчанию */
  }
  cache = { at: Date.now(), plans };
  return plans;
}

export function findPlan(plans: Plan[], code: string | null | undefined): Plan {
  return plans.find((p) => p.code === code) ?? plans.find((p) => p.code === DEFAULT_PLAN) ?? plans[plans.length - 1];
}

export const FEATURE_LABEL: Record<Feature, string> = {
  manual_leads: "Ручное создание заявок",
  chat_history: "История чатов и перехват диалога",
  stats: "Статистика",
  lead_transfer: "Менеджеры и передача заявок",
  assistant: "ИИ-ассистент",
};
