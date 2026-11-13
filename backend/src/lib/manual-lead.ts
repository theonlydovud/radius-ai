import { createAdminClient } from "./supabase/server";
import { fetchLead } from "./leads";
import { assignNextManager } from "./managers";
import type { AuthUser } from "./auth";
import { ownsAccount } from "./tenant";

/**
 * Заявка вручную — из формы «Новая заявка» и от ИИ-ассистента.
 *   { client_name, client_phone, origin_city?, destination_city?, weight?, cargo_type?, request?, note?, manager_id?, account_id? }
 * Менеджер создаёт заявку только себе — она сразу «В работе».
 * Руководитель и супер-админ выбирают ответственного: id менеджера, "auto" — следующий
 * по очереди, null — без ответственного. Такая заявка — «Новая».
 * requirePhone=false — ассистент может завести заявку без телефона («отправь заявку Хуршиду…»).
 */

export type ManualLeadResult = { lead: any } | { error: string; status: number };

/** Поле формы: обрезанная строка не длиннее max символов, пустая — undefined. */
export function field(value: unknown, max: number) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return v || undefined;
}

export async function createManualLead(
  auth: AuthUser,
  body: Record<string, any>,
  { requirePhone = true }: { requirePhone?: boolean } = {}
): Promise<ManualLeadResult> {
  const supabase = createAdminClient();
  const company = auth.company.id;

  const client_name = field(body.client_name, 100) ?? (requirePhone ? undefined : "Клиент");
  const client_phone = field(body.client_phone, 40) ?? (requirePhone ? undefined : "");
  if (!client_name || client_phone === undefined) return { error: "Укажите имя клиента и телефон.", status: 400 };
  if (client_phone && client_phone.replace(/\D/g, "").length < 5) return { error: "Проверьте номер телефона.", status: 400 };

  let manager_id: string | null = null;
  if (auth.role === "manager") {
    if (!auth.manager_id) return { error: "Вы не привязаны к очереди менеджеров.", status: 403 };
    manager_id = auth.manager_id;
  } else if (!auth.company.features.lead_transfer) {
    manager_id = null; // на тарифе без менеджеров заявка остаётся у владельца
  } else if (body.manager_id === "auto") {
    manager_id = (await assignNextManager(supabase, company))?.id ?? null;
  } else if (body.manager_id) {
    const { data: m } = await supabase.from("managers").select("id").eq("id", body.manager_id).eq("company_id", company).maybeSingle();
    if (!m) return { error: "Менеджер не найден.", status: 400 };
    manager_id = m.id;
  }

  const collected_data = Object.fromEntries(
    Object.entries({
      origin_city: field(body.origin_city, 60),
      destination_city: field(body.destination_city, 60),
      weight: field(body.weight, 60),
      cargo_type: field(body.cargo_type, 100),
      // Что хочет клиент — для компаний не из логистики (lead_kind = generic).
      request: field(body.request, 300),
      note: field(body.note, 1000),
      created_by: field(body.created_by, 100) ?? auth.name,
      // Аккаунт, выбранный в панели при создании: заявка видна в его разделе.
      account_id: (await ownsAccount(company, body.account_id)) ? (body.account_id as string) : undefined,
    }).filter(([, v]) => v !== undefined)
  );

  const { data, error } = await supabase
    .from("leads")
    .insert({
      session_id: null,
      company_id: company,
      client_name,
      client_phone,
      collected_data,
      status: auth.role === "manager" ? "in_progress" : "new",
      manager_id,
    })
    .select("id")
    .single();
  if (error) {
    // До migration-manual-leads.sql база требует переписку у каждой заявки.
    const hint = /session_id/.test(error.message) ? " Выполните migration-manual-leads.sql в Supabase." : "";
    return { error: `Не удалось создать заявку.${hint}`, status: 500 };
  }
  return { lead: await fetchLead(supabase, data.id, company) };
}
