import { createAdminClient } from "../lib/supabase/server";
import { invalidateAuthCache } from "../lib/auth";
import { normalizeSettings } from "../lib/company-settings";
import { companyAiStatus } from "../lib/ai-key";
import type { RouteContext } from "../index";

/**
 * Настройки компании (только руководитель):
 *   GET /api/settings/company → { settings, deal_available }
 *   PUT /api/settings/company { deal?, deadlines?, work? }
 * Блок сделки включается только на тарифах, где он есть (Business, Pro).
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const company = ctx.auth!.company;
  // ai: shared — общий ключ Gemini; own — свой ключ компании; broken — свой ключ не расшифровать.
  return Response.json({ data: { settings: company.settings, deal_available: company.features.deal, ai: await companyAiStatus(company.id) } });
}

export async function PUT(req: Request, ctx: RouteContext) {
  const company = ctx.auth!.company;
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();
  const { data: row } = await supabase.from("companies").select("settings").eq("id", company.id).maybeSingle();
  const current = normalizeSettings(row?.settings);
  const next = normalizeSettings({
    deal: { ...current.deal, ...(body.deal ?? {}) },
    deadlines: { ...current.deadlines, ...(body.deadlines ?? {}) },
    work: { ...current.work, ...(body.work ?? {}) },
  });
  if (next.deal.enabled && !company.features.deal) {
    return Response.json({ error: "Блок сделки доступен в тарифе Business.", code: "plan_required", feature: "deal" }, { status: 403 });
  }
  // Остальное в settings (например, свой ключ Gemini — ai) не трогаем.
  const { error } = await supabase.from("companies").update({ settings: { ...(row?.settings ?? {}), ...next } }).eq("id", company.id);
  if (error) {
    const hint = /settings/.test(error.message) ? " Выполните migration-deals.sql в Supabase." : "";
    return Response.json({ error: error.message + hint }, { status: 500 });
  }
  invalidateAuthCache();
  return Response.json({ data: { settings: next, deal_available: company.features.deal } });
}
