import { createAdminClient } from "./supabase/server";
import { getOrCreateSession } from "./conversation";
import { scheduleReply } from "./burst";
import { enqueueChat, replyToPending } from "./auto-reply";

/**
 * Клиенты, пишущие Telegram-боту (Bot API, вебхук). Telegram считает доставку
 * неудачной, если не получил ответ вовремя, и присылает то же сообщение снова.
 * Поэтому маршрут отвечает сразу, обработка идёт в фоне, а повторы отсекаются
 * по update_id. Сообщения подряд склеиваются так же, как в Instagram.
 */

export type TelegramBotAccount = { id: string; access_token: string };

const SEEN_LIMIT = 2000;
const g = globalThis as unknown as { __radiusTgBotSeen?: Set<string> };
const seen = (g.__radiusTgBotSeen ??= new Set());

async function sendMessage(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description ?? `HTTP ${res.status}`);
}

/** Обрабатывает update в фоне и сразу возвращает управление. */
export function handleTelegramBotUpdate(account: TelegramBotAccount, update: any) {
  const msg = update?.message;
  if (!msg?.text || !msg?.chat?.id) return;
  // Группы, супергруппы, каналы и другие боты — игнорируем.
  if (msg.chat.type !== "private" || msg.from?.is_bot) return;

  const updateKey = `${account.id}:${update.update_id}`;
  if (seen.has(updateKey)) return;
  seen.add(updateKey);
  if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);

  const chatId = String(msg.chat.id);
  const name: string = msg.chat.first_name ?? msg.chat.username ?? "Клиент Telegram";
  enqueueChat(`${account.id}:${chatId}`, () => receive(account, chatId, name, msg.text));
}

async function receive(account: TelegramBotAccount, chatId: string, name: string, text: string) {
  const supabase = createAdminClient();
  const tag = `[tg-bot:${account.id.slice(0, 8)}]`;
  const session = await getOrCreateSession(supabase, account.id, chatId, name);
  if (!session) return;

  await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });
  console.log(`${tag} сообщение от ${chatId}: «${text.slice(0, 60)}»`);
  // Менеджер уже ведёт диалог — ИИ не вмешивается.
  if (session.status === "manager_takeover") return;

  const key = `${account.id}:${chatId}`;
  scheduleReply(key, () => retryTelegramBotReply(account, chatId));
}

/** Ставит ответ в очередь чата; его же вызывает восстановление пропущенных ответов. */
export function retryTelegramBotReply(account: TelegramBotAccount, chatId: string) {
  enqueueChat(`${account.id}:${chatId}`, () =>
    replyToPending({
      accountId: account.id,
      clientId: chatId,
      clientName: "Клиент Telegram",
      tag: `[tg-bot:${account.id.slice(0, 8)}]`,
      send: (text) => sendMessage(account.access_token, chatId, text),
    })
  );
}
