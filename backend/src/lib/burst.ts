import { createAdminClient } from "./supabase/server";
import { sleep } from "./background";

/**
 * Склейка нескольких сообщений подряд. Клиенты часто пишут так:
 *   «Assalomu aleykum» / «yukim bor edi» / «obkelasizmi?»
 * Каждое сообщение сразу сохраняется в БД, а ответ откладывается до паузы в переписке:
 * бот отвечает один раз на всё, что клиент написал после его последнего ответа.
 *
 * Без таймеров в памяти (работает и на Vercel, где процесс между запросами не живёт):
 * каждое сообщение после сохранения ждёт QUIET_MS и смотрит в базу. Отвечает то, чьё
 * сообщение оказалось последним, — или любое, если клиент пишет без остановки дольше
 * MAX_WAIT_MS. Два ответа сразу не уйдут: перед ответом берётся блокировка диалога.
 *
 * REPLY_DEBOUNCE_MS — сколько ждать тишины (по умолчанию 20 с);
 * REPLY_MAX_WAIT_MS — дольше этого не ждём, даже если клиент пишет без остановки (60 с).
 * Один ответ на всю серию = один запрос к ИИ = одно сообщение тарифа.
 */

const QUIET_MS = Number(process.env.REPLY_DEBOUNCE_MS || 20_000);
const MAX_WAIT_MS = Number(process.env.REPLY_MAX_WAIT_MS || 60_000);
/** Блокировка, которую никто не снял (функция упала), через это время считается свободной. */
const LOCK_STALE_MS = 2 * 60_000;

/** Сообщения клиента после последнего ответа бота/менеджера (по порядку). */
async function pendingUserMessages(sessionId: string) {
  const { data } = await createAdminClient()
    .from("messages")
    .select("id, sender, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as { id: string; sender: string; created_at: string }[];
  const pending: typeof rows = [];
  for (const m of rows) {
    if (m.sender !== "user") break;
    pending.unshift(m);
  }
  return pending;
}

/**
 * Блокировка диалога на время ответа (chat_sessions.reply_lock_at). true — взяли.
 * staleMs — чужая блокировка старше этого считается брошенной.
 * До миграции колонки нет — работаем без блокировки, как раньше.
 */
export async function lockSession(sessionId: string, staleMs = LOCK_STALE_MS) {
  const now = new Date();
  const { data, error } = await createAdminClient()
    .from("chat_sessions")
    .update({ reply_lock_at: now.toISOString() })
    .eq("id", sessionId)
    .or(`reply_lock_at.is.null,reply_lock_at.lt.${new Date(now.getTime() - staleMs).toISOString()}`)
    .select("id");
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

export async function unlockSession(sessionId: string) {
  await createAdminClient().from("chat_sessions").update({ reply_lock_at: null }).eq("id", sessionId);
}

/**
 * Пауза склейки для сообщения messageId: подождать тишины и, если отвечать нам, ответить.
 * reply — сам ответ (читает всю пачку ожидающих сообщений из истории).
 */
export async function replyAfterPause(sessionId: string, messageId: string, reply: () => Promise<void>) {
  await sleep(QUIET_MS);
  const pending = await pendingUserMessages(sessionId);
  if (!pending.length) return; // уже ответили (бот по более позднему сообщению или менеджер)
  const latest = pending[pending.length - 1];
  const waited = Date.now() - Date.parse(pending[0].created_at);
  // Клиент дописал — ответит функция его последнего сообщения. Но не дольше MAX_WAIT_MS.
  if (latest.id !== messageId && waited < MAX_WAIT_MS) return;
  if (!(await lockSession(sessionId))) return;
  try {
    await reply();
  } finally {
    await unlockSession(sessionId);
  }
}

/**
 * Делит историю на «до» и «ожидающие ответа»: все сообщения клиента после
 * последнего ответа бота/менеджера склеиваются в один текст.
 */
export function splitPending<T extends { role: string; text: string }>(turns: T[]) {
  let i = turns.length;
  while (i > 0 && turns[i - 1].role === "user") i--;
  return {
    before: turns.slice(0, i),
    pending: turns
      .slice(i)
      .map((t) => t.text)
      .join("\n"),
  };
}
