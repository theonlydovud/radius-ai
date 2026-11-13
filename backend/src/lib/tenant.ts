import { createAdminClient } from "./supabase/server";
import { companyInfo, type AuthCompany } from "./auth";

/**
 * Разделение данных между компаниями. Компании принадлежат:
 *   accounts.company_id  — Instagram-аккаунты (а через них переписка, база знаний и правила);
 *   managers.company_id  — менеджеры и очередь;
 *   leads.company_id     — заявки (у ручной заявки нет переписки, поэтому поле своё).
 * id компании всегда берётся из входа (auth.company.id), никогда из запроса.
 */

export const NO_ID = "00000000-0000-0000-0000-000000000000";

/** id Instagram-аккаунтов компании. */
export async function companyAccountIds(companyId: string): Promise<string[]> {
  const { data, error } = await createAdminClient().from("accounts").select("id").eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((a: { id: string }) => a.id);
}

/** Аккаунт принадлежит компании? Пустой id — нет. */
export async function ownsAccount(companyId: string, accountId: unknown) {
  if (typeof accountId !== "string" || !accountId) return false;
  const { data } = await createAdminClient().from("accounts").select("id").eq("id", accountId).eq("company_id", companyId).maybeSingle();
  return Boolean(data);
}

/** Диалог (chat_sessions) принадлежит компании — через его аккаунт. */
export async function ownsSession(companyId: string, sessionId: unknown) {
  if (typeof sessionId !== "string" || !sessionId) return false;
  const { data } = await createAdminClient().from("chat_sessions").select("account_id").eq("id", sessionId).maybeSingle();
  return data ? ownsAccount(companyId, data.account_id) : false;
}

export async function ownsManager(companyId: string, managerId: unknown) {
  if (typeof managerId !== "string" || !managerId) return false;
  const { data } = await createAdminClient().from("managers").select("id").eq("id", managerId).eq("company_id", companyId).maybeSingle();
  return Boolean(data);
}

/** Строка знаний/правил принадлежит компании — через аккаунт. */
export async function ownsAccountRow(companyId: string, table: "knowledge" | "system_rules", id: unknown) {
  if (typeof id !== "string" || !id) return false;
  const { data } = await createAdminClient().from(table).select("account_id").eq("id", id).maybeSingle();
  return data ? ownsAccount(companyId, data.account_id) : false;
}

// ---------------------------------------------------------------------
// Компания Instagram-аккаунта — для вебхука и создания заявок (кэш 30 с)
// ---------------------------------------------------------------------

const cache = new Map<string, { at: number; value: string | null }>();

export async function accountCompanyId(accountId: string | null | undefined): Promise<string | null> {
  if (!accountId) return null;
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const { data } = await createAdminClient().from("accounts").select("company_id").eq("id", accountId).maybeSingle();
  const value = (data?.company_id as string | null) ?? null;
  cache.set(accountId, { at: Date.now(), value });
  if (cache.size > 1000) cache.clear();
  return value;
}

export async function accountCompany(accountId: string | null | undefined): Promise<AuthCompany | null> {
  return companyInfo(await accountCompanyId(accountId));
}

/**
 * Почему бот не отвечает клиентам этой компании (null — отвечает):
 * кончился пробный период, оплаченный период или сообщения тарифа.
 * Счётчик сообщений читается из базы заново: кэш компании живёт 30 секунд.
 */
export async function aiBlockReason(company: AuthCompany | null): Promise<"trial" | "period" | "limit" | null> {
  if (!company || company.unlimited) return null;
  if (company.status === "expired") return "trial";
  if (company.ai_blocked === "period") return "period";
  const limit = company.usage.messages_limit;
  if (limit === null) return null;
  const { data } = await createAdminClient().from("companies").select("messages_used").eq("id", company.id).maybeSingle();
  return (Number(data?.messages_used) || 0) >= limit ? "limit" : null;
}

/**
 * Один ответ бота = одно сообщение тарифа. Считаем у всех компаний (у наших — для статистики).
 * Когда лимит выбран — один раз сообщаем владельцу DexaAI: компании пора продлеваться.
 */
export async function countBotReply(company: AuthCompany | null, notify: (text: string) => Promise<void>) {
  if (!company) return;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("count_company_message", { p_company: company.id });
  if (error) return console.error("[usage] счётчик сообщений:", error.message);
  const used = Number(Array.isArray(data) ? data[0] : data) || 0;
  const limit = company.usage.messages_limit;
  if (limit === null || used < limit) return;
  const { data: first } = await supabase
    .from("companies")
    .update({ limit_notified_at: new Date().toISOString() })
    .eq("id", company.id)
    .is("limit_notified_at", null)
    .select("id");
  if (first?.length) {
    await notify(`📈 <b>Лимит сообщений исчерпан</b>
Компания: <b>${company.name.replace(/[<>&]/g, "")}</b>
Тариф ${company.plan?.name}: ${used} из ${limit}. Бот перестал отвечать клиентам — пора продлевать.`);
  }
}

/** Сколько Instagram-аккаунтов можно подключить по тарифу. Текст ошибки или null. */
export async function instagramLimitError(company: AuthCompany | null): Promise<string | null> {
  const limit = company?.usage.instagram_accounts ?? null;
  if (!company || limit === null) return null;
  const connected = (await companyAccountIds(company.id)).length;
  if (connected < limit) return null;
  return limit === 1
    ? "К компании уже подключён Instagram-аккаунт. Один аккаунт — одна компания: для второго зарегистрируйте отдельную компанию."
    : `По тарифу можно подключить не больше ${limit} Instagram-аккаунтов.`;
}

export const forbidden = (error = "Нет доступа.") => Response.json({ error }, { status: 404 });
