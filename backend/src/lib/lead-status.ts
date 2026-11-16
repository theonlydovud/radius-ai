import { CURRENCIES, type CompanySettings } from "./company-settings";

/**
 * Время каждой смены статуса — в журнал lead_status_log (для статистики и напоминаний,
 * в интерфейсе не показывается). Ошибка журнала не должна ломать саму смену статуса.
 */
export async function logStatus(supabase: any, lead: { id: string; company_id?: string | null }, status: string, by: string | null) {
  const { error } = await supabase.from("lead_status_log").insert({ lead_id: lead.id, company_id: lead.company_id ?? null, status, changed_by: by });
  if (error) console.warn(`[lead-status] журнал не записан: ${error.message}`);
}

export type Deal = { deal_type: string | null; deal_price: number; deal_cost: number; deal_currency: string };

const money = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : NaN;
};

/**
 * Блок сделки: значения из запроса поверх уже сохранённых.
 * Обязательно: обе ставки и валюта, вид — если у компании задан список видов.
 */
export function parseDeal(input: any, existing: any, settings: CompanySettings): { deal: Deal } | { error: string } {
  const s = settings.deal;
  const pick = (k: string) => (input && input[k] !== undefined ? input[k] : existing?.[k]);
  const type = pick("deal_type");
  const price = money(pick("deal_price"));
  const cost = money(pick("deal_cost"));
  const currency = pick("deal_currency");

  if (s.types.length && !s.types.includes(String(type ?? ""))) return { error: `Выберите «${s.type_label}».` };
  if (price === null || Number.isNaN(price)) return { error: `Укажите «${s.price_label}» — число.` };
  if (cost === null || Number.isNaN(cost)) return { error: `Укажите «${s.cost_label}» — число.` };
  if (!CURRENCIES.includes(currency)) return { error: "Выберите валюту." };
  return { deal: { deal_type: s.types.length ? String(type) : type ? String(type).slice(0, 30) : null, deal_price: price, deal_cost: cost, deal_currency: currency } };
}

/** «Дорого»: цена, которую хотел клиент / цена конкурента. */
export function parseLostPrice(input: any): { lost_price: number; lost_currency: string } | { error: string } {
  const price = money(input?.lost_price);
  if (price === null || Number.isNaN(price) || price <= 0) return { error: "Укажите цену, которую хотел клиент или предложил конкурент." };
  if (!CURRENCIES.includes(input?.lost_currency)) return { error: "Выберите валюту цены клиента." };
  return { lost_price: price, lost_currency: input.lost_currency };
}
