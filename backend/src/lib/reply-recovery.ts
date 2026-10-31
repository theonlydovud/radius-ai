import { createAdminClient } from "./supabase/server";
import { retryInstagramReply } from "./instagram";
import { isTelegramUserAccount } from "./telegram";
import { retryTelegramBotReply } from "./telegram-bot";

/**
 * Страховка от молчания бота. Ответ может потеряться: сервер перезапустился во
 * время паузы склейки или не удалось отправить сообщение. Раз в минуту ищем
 * диалоги, где последнее слово за клиентом, и отвечаем ещё раз.
 * Telegram-аккаунты с личным входом сюда не входят: у них своя память чата.
 */

const MIN_AGE_MS = 2 * 60_000; // дольше любой паузы склейки вместе с ответом Gemini
const MAX_AGE_MS = 60 * 60_000; // на очень старое сообщение отвечать поздно
const MAX_ATTEMPTS = 3;
const INTERVAL_MS = 60_000;

const attempts = new Map<string, number>();

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

  const missed = [...latest.entries()].filter(
    ([, m]) => m.sender === "user" && now - Date.parse(m.created_at) >= MIN_AGE_MS
  );
  if (missed.length === 0) return;

  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("id, client_id, status, accounts(id, platform, access_token, webhook_verify_token)")
    .in("id", missed.map(([id]) => id))
    .eq("status", "ai_active");

  for (const session of (sessions ?? []) as any[]) {
    const account = session.accounts;
    if (!account?.access_token || isTelegramUserAccount(account)) continue;

    const key = `${session.id}:${latest.get(session.id)!.created_at}`;
    const tries = attempts.get(key) ?? 0;
    if (tries >= MAX_ATTEMPTS) continue;
    attempts.set(key, tries + 1);

    console.log(`[recovery] сообщение клиента без ответа (${account.platform}, попытка ${tries + 1}), отвечаю`);
    if (account.platform === "instagram") retryInstagramReply(account, session.client_id);
    else if (account.platform === "telegram") retryTelegramBotReply(account, session.client_id);
  }

  if (attempts.size > 5000) attempts.clear();
}

export function startReplyRecovery() {
  const run = () => recoverMissedReplies().catch((e) => console.error("[recovery] ошибка:", e?.message ?? e));
  setTimeout(run, 30_000);
  setInterval(run, INTERVAL_MS).unref();
}
