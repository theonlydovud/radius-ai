import { createAdminClient } from "./supabase/server";

/**
 * Владелец платформы DexaAI. Входит через Telegram, выбирает любую компанию и работает в ней
 * как руководитель, но «невидимкой»: его нет в app_users, списках сотрудников и лимитах тарифа,
 * на него не действует правило «одно устройство».
 * Кто владелец — app_settings.platform_admins = { telegram_ids: [...] } (или DEXA_PLATFORM_ADMIN_IDS).
 */

let cache: { at: number; ids: Set<string> } | null = null;

export async function platformAdminIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.ids;
  const ids = new Set((process.env.DEXA_PLATFORM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "platform_admins").maybeSingle();
  for (const id of (data?.value as any)?.telegram_ids ?? []) ids.add(String(id));
  cache = { at: Date.now(), ids };
  return ids;
}

export async function isPlatformAdmin(telegramId: number | string | null | undefined) {
  if (telegramId === null || telegramId === undefined) return false;
  return (await platformAdminIds()).has(String(telegramId));
}

/** Имя, под которым владелец платформы виден в действиях (кто закрыл заявку и т. п.). */
export const PLATFORM_NAME = "DexaAI";
