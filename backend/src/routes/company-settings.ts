import { createAdminClient } from "../lib/supabase/server";
import { invalidateAuthCache } from "../lib/auth";
import { applyTemplate, normalizeSettings, STAGE_KEYS, TEMPLATES, type Template } from "../lib/company-settings";
import { companyAiStatus } from "../lib/ai-key";
import type { RouteContext } from "../index";
import { createHash, randomBytes } from "node:crypto";
import { frontendUrl } from "../lib/urls";

/**
 * Настройки компании (только руководитель):
 *   GET /api/settings/company → { settings, deal_available, deadlines_available }
 *   PUT /api/settings/company { template?, stages?, lost_reasons?, terms?, modules?, partners?, deal?, deadlines?, work? }
 *
 * template — применить шаблон бизнеса (этапы, причины, термины, блок сделки берутся из него).
 * stages — только переименовать этапы, которые уже есть (добавлять и удалять — позже, этап 2 ТЗ).
 * Блок сделки — тарифы Business и Pro; контроль сроков — там же и только при 2+ сотрудниках.
 */
export async function GET(_req: Request, ctx: RouteContext) {
  const company = ctx.auth!.company;
  // Настройки — прямо из базы, не из кэша сессии: страница настроек должна видеть только что сохранённое.
  const { data: row } = await createAdminClient().from("companies").select("settings").eq("id", company.id).maybeSingle();
  const settings = row ? normalizeSettings(row.settings) : company.settings;
  // Ограничения тарифа и команды — как в сессии (auth.ts publicCompany).
  if (!company.features.deal) settings.deal.enabled = false;
  if (!company.features.lead_transfer || company.staff_count < 2) settings.modules.deadlines = false;
  // ai: shared — общий ключ Gemini; own — свой ключ компании; broken — свой ключ не расшифровать.
  return Response.json({
    data: {
      settings,
      deal_available: company.features.deal,
      deadlines_available: company.features.lead_transfer && company.staff_count >= 2,
      ai: await companyAiStatus(company.id),
      mcp: {
        endpoint: frontendUrl("/api/mcp"),
        key_preview: typeof (row?.settings as any)?.mcp?.key_hash === "string"
          ? `${String((row?.settings as any).mcp.key_hash).slice(0, 8)}••••••••`
          : null,
        enabled: Boolean((row?.settings as any)?.mcp?.key_hash),
      },
    },
  });
}

export async function PUT(req: Request, ctx: RouteContext) {
  const company = ctx.auth!.company;
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();
  const bad = (error: string, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status: extra.code ? 403 : 400 });

  const { data: row } = await supabase.from("companies").select("settings").eq("id", company.id).maybeSingle();
  let current = normalizeSettings(row?.settings);

  if (body.template !== undefined) {
    if (!(TEMPLATES as readonly string[]).includes(body.template)) return bad("Неизвестный шаблон.");
    current = applyTemplate(current, body.template as Template);
    if (!company.features.deal) current.deal.enabled = false;
  }

  // Переименовать можно только существующие этапы.
  const stages = { ...current.stages };
  if (body.stages && typeof body.stages === "object") {
    for (const key of STAGE_KEYS) {
      const v = body.stages[key];
      if (v === undefined) continue;
      if (stages[key] === null) return bad("Этот этап выключен в вашем шаблоне.");
      if (typeof v !== "string" || !v.trim()) return bad("Название этапа не может быть пустым.");
      stages[key] = v;
    }
  }

  const next = normalizeSettings({
    template: current.template,
    stages,
    lost_reasons: body.lost_reasons ?? current.lost_reasons,
    terms: { ...current.terms, ...(body.terms ?? {}) },
    modules: { ...current.modules, ...(body.modules ?? {}) },
    partners: { ...current.partners, ...(body.partners ?? {}) },
    deal: { ...current.deal, ...(body.deal ?? {}) },
    deadlines: { ...current.deadlines, ...(body.deadlines ?? {}) },
    work: { ...current.work, ...(body.work ?? {}) },
  });
  if (Array.isArray(body.lost_reasons) && next.lost_reasons.length < 2) return bad("Оставьте хотя бы одну причину, кроме «Другое».");

  if (next.deal.enabled && !company.features.deal) {
    return bad("Блок сделки доступен в тарифе Business.", { code: "plan_required", feature: "deal" });
  }
  if (next.modules.deadlines && !current.modules.deadlines) {
    if (!company.features.lead_transfer) return bad("Контроль сроков доступен в тарифе Business.", { code: "plan_required", feature: "lead_transfer" });
    if (company.staff_count < 2) return bad("Контроль сроков нужен, когда в кабинете 2 и больше сотрудников.");
  }

  if (body.mcp_action === "generate") {
    const key = `dexa_mcp_${randomBytes(24).toString("base64url")}`;
    const keyHash = createHash("sha256").update(key).digest("hex");
    const settings = { ...(row?.settings ?? {}), mcp: { key_hash: keyHash, created_at: new Date().toISOString() } };
    const { error } = await supabase.from("companies").update({ settings }).eq("id", company.id);
    if (error) return bad("Не удалось создать MCP ключ.");
    invalidateAuthCache();
    return Response.json({ data: { mcp: { endpoint: frontendUrl("/api/mcp"), key_preview: `${keyHash.slice(0, 8)}••••••••`, enabled: true, key } } });
  }
  if (body.mcp_action === "revoke") {
    const settings = { ...(row?.settings ?? {}) }; delete (settings as any).mcp;
    const { error } = await supabase.from("companies").update({ settings }).eq("id", company.id);
    if (error) return bad("Не удалось отозвать MCP ключ.");
    invalidateAuthCache();
    return Response.json({ data: { mcp: { endpoint: frontendUrl("/api/mcp"), key_preview: null, enabled: false } } });
  }

  // Остальное в settings (например, свой ключ Gemini — ai) не трогаем.
  const { error } = await supabase.from("companies").update({ settings: { ...(row?.settings ?? {}), ...next } }).eq("id", company.id);
  if (error) {
    const hint = /settings/.test(error.message) ? " Выполните migration-deals.sql в Supabase." : "";
    return Response.json({ error: error.message + hint }, { status: 500 });
  }
  invalidateAuthCache();
  return Response.json({
    data: { settings: next, deal_available: company.features.deal, deadlines_available: company.features.lead_transfer && company.staff_count >= 2 },
  });
}
