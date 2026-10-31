import { createAdminClient } from "./supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "./gemini";
import { getHistory, getOrCreateSession, maybeCreateOrUpdateLead } from "./conversation";
import { splitPending } from "./burst";

/**
 * Общий ответ бота для Instagram и Telegram-бота: один ответ на все сообщения
 * клиента, пришедшие после последнего ответа. Если Gemini недоступен даже после
 * повторов, клиент не остаётся без ответа, а получает просьбу написать позже.
 */

const BUSY_REPLY = "Слишком большая нагрузка на сервера, повторите попытку через 1-2 минуты.";

const g = globalThis as unknown as { __radiusChatQueues?: Map<string, Promise<void>> };
const queues = (g.__radiusChatQueues ??= new Map());

/** Действия по одному чату — строго по порядку, разные чаты — параллельно. */
export function enqueueChat(key: string, task: () => Promise<void>) {
  const next = (queues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(task)
    .catch((e: any) => console.error(`[chat:${key.slice(0, 8)}] ошибка: ${e?.message ?? e}`))
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  queues.set(key, next);
}

export async function replyToPending(options: {
  accountId: string;
  clientId: string;
  /** Имя на случай, если сессию придётся создать заново. */
  clientName: string;
  tag: string;
  send: (text: string) => Promise<void>;
}) {
  const { accountId, clientId, clientName, tag, send } = options;
  const supabase = createAdminClient();
  const session = await getOrCreateSession(supabase, accountId, clientId, clientName);
  if (!session || session.status === "manager_takeover") return;

  const { before, pending } = splitPending(await getHistory(supabase, session.id));
  if (!pending) return; // уже ответили (например, менеджер)

  let reply: string;
  try {
    const systemInstruction = await buildSystemInstruction(pending, accountId);
    reply = await sendToGemini(systemInstruction, before, pending);
  } catch (err: any) {
    const reason = err instanceof GeminiRateLimitError ? "лимит Gemini (429)" : err?.message ?? err;
    console.error(`${tag} ИИ не ответил, отправляю просьбу написать позже: ${reason}`);
    reply = BUSY_REPLY;
  }

  try {
    await send(reply);
  } catch (e: any) {
    console.error(`${tag} не удалось отправить ответ: ${e?.message}`);
    throw e;
  }
  console.log(`${tag} ответ отправлен (${reply.length} симв., на ${pending.split("\n").length} сообщ.)`);

  await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
  if (reply !== BUSY_REPLY) {
    await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, [...before, { role: "user", text: pending }], reply);
  }
}
