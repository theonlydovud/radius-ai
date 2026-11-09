import { createAdminClient } from "./supabase/server";
import { getLeadNotifySettings, ownerChatId, rememberChat, renderLeadMessage, resolveTarget, TAKE_PREFIX, tgCall } from "./lead-notify";

/**
 * Обновления бота заявок (вебхук /api/telegram/leads-bot): нажатие «✅ Ishga oldim».
 * Нажать могут менеджеры с заданным telegram_id и владелец (TELEGRAM_OWNER_CHAT_ID).
 * Первый нажавший записывается в заявку; остальным бот отвечает, кто уже взял.
 */

export async function handleLeadsBotUpdate(update: any) {
  rememberChat(update?.message?.chat ?? update?.my_chat_member?.chat);
  const cb = update?.callback_query;
  if (cb?.data?.startsWith(TAKE_PREFIX)) await handleTake(cb);
}

async function answer(token: string, callbackId: string, text: string, alert = false) {
  await tgCall(token, "answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: alert }).catch((e) =>
    console.error("[leads-bot] answerCallbackQuery:", e?.message)
  );
}

/** Кто нажал: менеджер по telegram_id или владелец. */
async function resolveTaker(from: any): Promise<string | null> {
  const id = Number(from?.id);
  if (!id) return null;
  const { data: manager } = await createAdminClient().from("managers").select("name").eq("telegram_id", id).maybeSingle();
  if (manager) return manager.name;
  if (ownerChatId() && String(id) === ownerChatId()) {
    return [from.first_name, from.last_name].filter(Boolean).join(" ") || "Владелец";
  }
  return null;
}

async function handleTake(cb: any) {
  const { token } = resolveTarget(await getLeadNotifySettings());
  if (!token) return;
  const leadId = String(cb.data).slice(TAKE_PREFIX.length);
  const supabase = createAdminClient();

  const taker = await resolveTaker(cb.from);
  if (!taker) return answer(token, cb.id, "Sizda ruxsat yo'q", true);

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
    return answer(token, cb.id, "Xatolik, qayta urinib ko'ring", true);
  }

  if (!taken) {
    const { data: lead } = await supabase.from("leads").select("taken_by").eq("id", leadId).maybeSingle();
    return answer(token, cb.id, lead ? `Bu arizani allaqachon oldi: ${lead.taken_by}` : "Ariza topilmadi", true);
  }

  // Новая заявка переходит «В работу», как кнопка «Взять в работу» на сайте.
  await supabase.from("leads").update({ status: "in_progress" }).eq("id", leadId).eq("status", "new");
  await answer(token, cb.id, "✅ Ariza sizga biriktirildi");
  console.log(`[leads-bot] заявку ${leadId.slice(0, 8)} взял ${taker}`);

  // Обновляем все копии сообщения: без кнопки, со строкой «Ishga oldi».
  const message = await renderLeadMessage(leadId);
  if (!message) return;
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
}
