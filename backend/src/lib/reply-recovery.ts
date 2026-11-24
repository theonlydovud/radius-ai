import { createAdminClient } from "./supabase/server";
import { retryInstagramReply } from "./instagram";
import { serverless } from "./background";

/**
 * Страховка от молчания бота. Ответ может потеряться: функция упала во время паузы
 * склейки, сервер перезапустился, не удалось отправить сообщение. Раз в минуту
 * (сервер — сам, Vercel — по /api/cron/tick) ищем диалоги, где последнее слово
 * за клиентом, и отвечаем ещё раз. Повтор по одному диалогу — не чаще RETRY_GAP_MS
 * (блокировка диалога в базе), поэтому при упорной ошибке клиента не засыпаем.
 */

const MIN_AGE_MS = 3 * 60_000; // дольше любой паузы склейки вместе с ответом Gemini
const MAX_AGE_MS = 60 * 60_000; // на очень старое сообщение отвечать поздно
const RETRY_GAP_MS = 10 * 60_000;
const INTERVAL_MS = 60_000;

export async function recoverMissedReplies() {
  const supabase = createAdminClient();
  const now = Date.now();
  const { data: recent, error } = await supabase
    .from("messages")
    .select("session_id, sender, created_at")
    .gte("created_at", new Date(now - MAX_AGE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  // Сообщения идут от новых к старым: первое по сессии — самое новое.
  const latest = new Map<string, { sender: string; created_at: string }>();
  for (const m of (recent ?? []) as { session_id: string; sender: string; created_at: string }[]) {
    if (!latest.has(m.session_id)) latest.set(m.session_id, m);
  }

  const missed = [...latest.entries()].filter(([, m]) => m.sender === "user" && now - Date.parse(m.created_at) >= MIN_AGE_MS);
  if (missed.length === 0) return 0;

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("id, client_id, status, accounts(id, platform, access_token)")
    .in("id", missed.map(([id]) => id))
    .eq("status", "ai_active");

  const tasks: Promise<void>[] = [];
  for (const session of (sessions ?? []) as any[]) {
    const account = session.accounts;
    if (!account?.access_token || account.platform !== "instagram") continue;
    console.log(`[recovery] сообщение клиента без ответа, отвечаю (session ${session.id.slice(0, 8)})`);
    tasks.push(retryInstagramReply(account, session.client_id, session.id, RETRY_GAP_MS).catch((e) => console.error(`[recovery] ${e?.message ?? e}`)));
  }
  await Promise.all(tasks);
  return tasks.length;
}

/** Обычный сервер: раз в минуту сам. На Vercel — /api/cron/tick. */
export function startReplyRecovery() {
  if (serverless()) return;
  const run = () => recoverMissedReplies().catch((e) => console.error("[recovery] ошибка:", e?.message ?? e));
  setTimeout(run, 30_000);
  setInterval(run, INTERVAL_MS).unref();
}
