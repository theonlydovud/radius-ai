import { createAdminClient } from "./supabase/server";
import { getLeadNotifySettings, rememberChat, renderLeadMessage, resolveTarget, TAKE_PREFIX, tgCall } from "./lead-notify";

/**
 * Обновления бота заявок (вебхук /api/telegram/leads-bot): нажатие «✅ Ishga oldim».
 * Нажать может любой, кто видит кнопку; менеджеры из списка записываются своим именем.
 * Первый нажавший записывается в заявку; остальным бот отвечает, кто уже взял.
 */

export async function handleLeadsBotUpdate(update: any) {
  rememberChat(update?.message?.chat ?? update?.my_chat_member?.chat);
  const cb = update?.callback_query;
  if (!cb?.data?.startsWith(TAKE_PREFIX)) return;
  let result = "ошибка";
  try {
    result = await handleTake(cb);
  } catch (e: any) {
    console.error("[leads-bot] нажатие не обработано:", e?.message);
    const { token } = resolveTarget(await getLeadNotifySettings().catch(() => ({} as any)));
    if (token) await answer(token, cb.id, "Xatolik, qayta urinib ko'ring", true);
  }
  await logPress(cb, result);
}

/**
 * Журнал последних нажатий (app_settings, ключ leads_bot_presses): видно, кто с какого
 * Telegram ID нажимал и что ответил бот, — так находится менеджер, который жмёт не с того аккаунта.
 */
const PRESS_LOG_KEY = "leads_bot_presses";
async function logPress(cb: any, result: string) {
  const f = cb.from ?? {};
  const entry = {
    at: new Date().toISOString(),
    telegram_id: f.id,
    name: [f.first_name, f.last_name].filter(Boolean).join(" "),
    username: f.username ?? null,
    lead: String(cb.data).slice(TAKE_PREFIX.length, TAKE_PREFIX.length + 8),
    result,
  };
  console.log(`[leads-bot] нажатие: ${entry.name} (@${entry.username ?? "-"}, id ${entry.telegram_id}) → ${result}`);
  try {
    const db = createAdminClient();
    const { data } = await db.from("app_settings").select("value").eq("key", PRESS_LOG_KEY).maybeSingle();
    const list = Array.isArray(data?.value?.list) ? data.value.list : [];
    await db.from("app_settings").upsert({
      key: PRESS_LOG_KEY,
      value: { list: [entry, ...list].slice(0, 50) },
      updated_at: entry.at,
    });
  } catch (e: any) {
    console.error("[leads-bot] журнал нажатий:", e?.message);
  }
}

async function answer(token: string, callbackId: string, text: string, alert = false) {
  await tgCall(token, "answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: alert }).catch((e) =>
    console.error("[leads-bot] answerCallbackQuery:", e?.message)
  );
}

/**
 * Кто нажал. Взять заявку может любой, кто видит кнопку (участники группы и получатели копий).
 * Менеджер из списка записывается своим именем из «Менеджеров», остальные — именем в Telegram.
 */
async function resolveTaker(from: any): Promise<string | null> {
  const id = Number(from?.id);
  if (!id) return null;
  const { data: manager } = await createAdminClient().from("managers").select("name").eq("telegram_id", id).maybeSingle();
  if (manager) return manager.name;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ");
  return name || (from.username ? `@${from.username}` : String(id));
}

/** Возвращает, чем закончилось нажатие, — для журнала. */
async function handleTake(cb: any): Promise<string> {
  const { token } = resolveTarget(await getLeadNotifySettings());
  if (!token) return "нет токена бота";
  const leadId = String(cb.data).slice(TAKE_PREFIX.length);
  const supabase = createAdminClient();

  const taker = await resolveTaker(cb.from);
  if (!taker) {
    // ID в ответе: менеджер пересылает его владельцу, тот вписывает в «Настройки → Менеджеры».
    await answer(token, cb.id, `Sizda ruxsat yo'q.\nSizning Telegram ID: ${cb.from?.id}\nUni administratorga yuboring.`, true);
    return "нет доступа";
  }

  // Условие taken_at IS NULL: при одновременных нажатиях заявку получит только первый.
  const now = new Date().toISOString();
  const { data: taken, error } = await supabase
    .from("leads")
    .update({ taken_by: taker, taken_by_telegram_id: Number(cb.from.id), taken_at: now })
    .eq("id", leadId)
    .is("taken_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[leads-bot] не удалось записать, кто взял заявку:", error.message);
    await answer(token, cb.id, "Xatolik, qayta urinib ko'ring", true);
    return `ошибка базы: ${error.message}`;
  }

  if (!taken) {
    const { data: lead } = await supabase.from("leads").select("taken_by").eq("id", leadId).maybeSingle();
    await answer(token, cb.id, lead ? `Bu arizani allaqachon oldi: ${lead.taken_by}` : "Ariza topilmadi", true);
    return lead ? `${taker}: уже взял ${lead.taken_by}` : `${taker}: заявка не найдена`;
  }

  // Новая заявка переходит «В работу», как кнопка «Взять в работу» на сайте.
  await supabase.from("leads").update({ status: "in_progress" }).eq("id", leadId).eq("status", "new");
  await answer(token, cb.id, "✅ Ariza sizga biriktirildi");
  console.log(`[leads-bot] заявку ${leadId.slice(0, 8)} взял ${taker}`);

  // Обновляем все копии сообщения: без кнопки, со строкой «Ishga oldi».
  const message = await renderLeadMessage(leadId);
  if (!message) return `взял ${taker}`;
  const copies = message.messages.length
    ? message.messages
    : [{ chat_id: String(cb.message?.chat?.id), message_id: cb.message?.message_id }];
  for (const copy of copies) {
    if (!copy.chat_id || !copy.message_id) continue;
    await tgCall(token, "editMessageText", {
      chat_id: copy.chat_id,
      message_id: copy.message_id,
      text: message.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }).catch((e) => console.error(`[leads-bot] не удалось обновить сообщение в ${copy.chat_id}: ${e?.message}`));
  }
  return `взял ${taker}`;
}
