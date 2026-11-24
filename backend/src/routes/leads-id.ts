import { createAdminClient } from "../lib/supabase/server";
import { fetchLead, leadControl } from "../lib/leads";
import { hasStage, isValidLostReason } from "../lib/company-settings";
import { logStatus, parseDeal, parseLostPrice } from "../lib/lead-status";
import { assignNextManager } from "../lib/managers";
import type { RouteContext } from "../index";

const NOT_CLOSED = { closed_at: null, closed_by: null, lost_reason: null, lost_comment: null, lost_price: null, lost_currency: null };

/**
 * Действия с заявкой (этапы: Новая → В работе → Ставка предложена → Продано / Не продано):
 *   { status: "in_progress" }                          — взять в работу / вернуть в работу
 *   { status: "offered", deal: {…} }                   — «Предложил ставку»: блок сделки обязателен, если он включён
 *   { deal: {…} }                                      — поправить ставку (до закрытия)
 *   { status: "sold", closed_by, deal?: {…} }          — продано: итоговые ставки обязательны, если блок включён
 *   { status: "not_sold", closed_by, lost_reason, lost_comment?, lost_price?, lost_currency? }
 *        «Дорого» — обязательна цена клиента/конкурента; «Другое» — обязателен комментарий
 *   { next_contact: { date: "YYYY-MM-DD", note } | null } — «Следующий контакт»
 *   { manager_id: id | null }                          — сменить ответственного (тариф с передачей заявок)
 *   { kind: "client" | "partner" }                     — бот ошибся с типом: клиент ↔ партнёр (водитель)
 * deal = { deal_type, deal_price, deal_cost, deal_currency }.
 * Менеджер работает только со своими заявками; «кто закрыл» — всегда он сам.
 * Время каждой смены статуса пишется в журнал и в status_changed_at.
 */
export async function PATCH(req: Request, { params, auth }: RouteContext) {
  const supabase = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const company = auth!.company;
  const settings = company.settings;
  const dealOn = settings.deal.enabled;
  const now = new Date().toISOString();
  const bad = (error: string, status = 400) => Response.json({ error }, { status });

  const { data: lead } = await supabase.from("leads").select("*").eq("id", params.id).eq("company_id", company.id).maybeSingle();
  if (!lead) return bad("Заявка не найдена.", 404);
  const closed = lead.status === "sold" || lead.status === "not_sold";

  if (auth?.role === "manager") {
    if (!auth.manager_id || lead.manager_id !== auth.manager_id) return bad("Это не ваша заявка.", 403);
    if (body.manager_id !== undefined) return bad("Ответственного меняет руководитель.", 403);
    body.closed_by = auth.name;
  }

  const updates: Record<string, unknown> = {};

  // Тип: клиент ↔ партнёр (бот ошибся). Партнёр — без ответственного и вне воронки;
  // ставший клиентом — новая заявка, ответственный из очереди (если в кабинете команда).
  if (body.kind !== undefined && body.kind !== (lead.kind ?? "client")) {
    if (body.kind !== "client" && body.kind !== "partner") return bad("Неизвестный тип.");
    if (body.kind === "partner") {
      Object.assign(updates, { kind: "partner", manager_id: null, assigned_at: null });
    } else {
      const manager = company.staff_count >= 2 ? await assignNextManager(supabase, company.id) : null;
      Object.assign(updates, { kind: "client", status: "new", status_changed_at: now, manager_id: manager?.id ?? null, assigned_at: manager ? now : null }, NOT_CLOSED);
    }
    const { error } = await supabase.from("leads").update(updates).eq("id", lead.id).eq("company_id", company.id);
    if (error) return Response.json({ error: /kind/.test(error.message) ? `${error.message} Выполните migration-partners.sql в Supabase.` : error.message }, { status: 500 });
    return Response.json({ data: await fetchLead(supabase, lead.id, company.id, { control: leadControl(settings), showMargin: auth?.role === "owner" }) });
  }

  // Ответственный
  if (body.manager_id !== undefined) {
    if (!company.features.lead_transfer) {
      return Response.json({ error: "Передача заявок менеджерам недоступна на вашем тарифе.", code: "plan_required", feature: "lead_transfer" }, { status: 403 });
    }
    if (body.manager_id !== null) {
      const { data: manager } = await supabase.from("managers").select("id").eq("id", body.manager_id).eq("company_id", company.id).maybeSingle();
      if (!manager) return bad("Менеджер не найден.");
    }
    updates.manager_id = body.manager_id;
    // С этого момента считаются «не взята в работу» и напоминания новому ответственному.
    if (body.manager_id !== lead.manager_id) updates.assigned_at = body.manager_id ? now : null;
  }

  // Следующий контакт
  if (body.next_contact !== undefined) {
    if (body.next_contact === null) {
      Object.assign(updates, { next_contact_date: null, next_contact_note: null });
    } else {
      const date = String(body.next_contact?.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return bad("Укажите дату следующего контакта.");
      const note = String(body.next_contact?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      Object.assign(updates, { next_contact_date: date, next_contact_note: note || null });
    }
  }

  // Ставка без смены статуса — правка до закрытия
  if (body.deal !== undefined && body.status === undefined) {
    if (!dealOn) return bad("Блок сделки выключен в настройках.");
    if (closed) return bad("Заявка закрыта — ставку больше не поменять.");
    const r = parseDeal(body.deal, lead, settings);
    if ("error" in r) return bad(r.error);
    Object.assign(updates, r.deal);
  }

  if (body.status !== undefined && body.status !== lead.status) {
    const status = body.status;
    // Только этапы, которые есть в воронке компании (у магазина, например, нет «В работе»).
    // В «Новая» только возвращают закрытую заявку — там, где нет этапа «В работе».
    if (!hasStage(settings, status) || (status === "new" && (!closed || settings.stages.in_progress !== null))) {
      return bad("Такого этапа нет в вашей воронке.");
    }
    if (status === "new") {
      Object.assign(updates, { status }, NOT_CLOSED);
    } else if (status === "in_progress") {
      Object.assign(updates, { status, taken_at: lead.taken_at ?? now }, NOT_CLOSED);
    } else if (status === "offered") {
      if (lead.status !== "in_progress" && lead.status !== "new") return bad("Ставку предлагают по заявке в работе.");
      if (dealOn) {
        const r = parseDeal(body.deal, lead, settings);
        if ("error" in r) return bad(r.error);
        Object.assign(updates, r.deal);
      }
      Object.assign(updates, { status, offered_at: now, taken_at: lead.taken_at ?? now });
    } else if (status === "sold" || status === "not_sold") {
      const closedBy = String(body.closed_by ?? "").trim();
      if (!closedBy) return bad("Укажите, кто закрывает заявку.");
      const closedFields = { closed_at: now, closed_by: closedBy };
      if (status === "sold") {
        if (dealOn) {
          // Итоговые ставки: подставлены из блока «Ставка», можно поправить. Маржа сохраняется вместе с ними.
          const r = parseDeal(body.deal, lead, settings);
          if ("error" in r) return bad(r.error);
          Object.assign(updates, r.deal);
        }
        Object.assign(updates, { status, lost_reason: null, lost_comment: null, lost_price: null, lost_currency: null }, closedFields);
      } else {
        if (!isValidLostReason(body.lost_reason) || !settings.lost_reasons.includes(body.lost_reason)) return bad("Выберите причину из списка.");
        const comment = String(body.lost_comment ?? "").trim();
        if (body.lost_reason === "other" && !comment) return bad("Для причины «Другое» напишите комментарий.");
        let lost: { lost_price: number | null; lost_currency: string | null } = { lost_price: null, lost_currency: null };
        // «Дорого» с ценой клиента/конкурента — там, где есть блок сделки (у B2B-шаблона).
        if (body.lost_reason === "too_expensive" && dealOn) {
          const r = parseLostPrice(body);
          if ("error" in r) return bad(r.error);
          lost = r;
        }
        Object.assign(updates, { status, lost_reason: body.lost_reason, lost_comment: comment || null, ...lost }, closedFields);
      }
    } else {
      return bad("Неизвестный статус.");
    }
    updates.status_changed_at = now;
  }

  if (Object.keys(updates).length === 0) return bad("Нечего менять.");

  const { data: updated, error } = await supabase.from("leads").update(updates).eq("id", params.id).eq("company_id", company.id).select("id").maybeSingle();
  if (error) {
    const hint = /lost_reason_check/.test(error.message)
      ? " Выполните migration-templates.sql в Supabase."
      : /column|status_check/.test(error.message)
        ? " Выполните migration-deals.sql в Supabase."
        : "";
    return Response.json({ error: `${error.message}${hint}` }, { status: 500 });
  }
  if (!updated) return bad("Заявка не найдена.", 404);
  if (updates.status) await logStatus(supabase, lead, String(updates.status), auth?.name ?? null);

  return Response.json({ data: await fetchLead(supabase, params.id, company.id, { control: leadControl(settings), showMargin: auth?.role === "owner" }) });
}

/**
 * Удалить заявку — только руководитель (index.ts не пускает сюда менеджеров и супер-админа).
 * Журнал статусов и напоминания по заявке удаляются вместе с ней (ON DELETE CASCADE);
 * переписка с клиентом остаётся в «Истории чатов».
 */
export async function DELETE(_req: Request, { params, auth }: RouteContext) {
  if (auth?.role !== "owner") return Response.json({ error: "Удалять заявки может только руководитель." }, { status: 403 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("leads").delete().eq("id", params.id).eq("company_id", auth.company.id).select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data?.length) return Response.json({ error: "Заявка не найдена." }, { status: 404 });
  console.log(`[leads] ${auth.name} удалил заявку ${params.id.slice(0, 8)} (${auth.company.name})`);
  return Response.json({ data: { deleted: true } });
}
