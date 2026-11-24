import { createAdminClient } from "./supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "./gemini";
import { getHistory, getOrCreateSession, maybeCreateOrUpdateLead } from "./conversation";
import { splitPending } from "./burst";
import { accountCompany, aiBlockReason, countBotReply } from "./tenant";
import { companyAi } from "./ai-key";
import { notifyDexaAdmins } from "./dexa-bot";
import { recordSecurityEvent } from "./security";

/**
 * Ответ бота в Instagram: один ответ на все сообщения клиента, пришедшие после
 * последнего ответа. Если Gemini недоступен даже после повторов и запасных моделей,
 * клиенту ничего не пишем (никаких «сервер перегружен»): сообщение остаётся без ответа,
 * и через несколько минут его подхватит восстановление пропущенных ответов (reply-recovery).
 */

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

  // Пробный/оплаченный период или сообщения тарифа закончились — бот молчит, сообщения клиента остаются в истории.
  const company = await accountCompany(accountId);
  const blocked = await aiBlockReason(company);
  if (blocked) {
    const why = { blocked: "компания заморожена или заблокирована DexaAI", trial: "пробный период закончился", period: "оплаченный период закончился", limit: "сообщения тарифа закончились" }[blocked];
    console.log(`${tag} компания «${company?.name}»: ${why} — ИИ не отвечает`);
    return;
  }

  const { before, pending } = splitPending(await getHistory(supabase, session.id));
  if (!pending) return; // уже ответили (например, менеджер)

  let reply: string;
  try {
    const systemInstruction = await buildSystemInstruction(pending, accountId);
    reply = await sendToGemini(systemInstruction, before, pending, await companyAi(company?.id));
  } catch (err: any) {
    const reason = err instanceof GeminiRateLimitError ? "лимит Gemini (429)" : err?.message ?? err;
    // Gemini отказался отвечать по соображениям безопасности — это сигнал для модерации.
    if (/SAFETY|PROHIBITED|blocked due to/i.test(String(err?.message ?? ""))) {
      await recordSecurityEvent({ companyId: company?.id, companyName: company?.name, source: "gemini", kind: "blocked_by_ai", excerpt: pending, accountId, sessionId: session.id });
    }
    console.error(`${tag} ИИ не ответил — клиенту ничего не пишем, повторим через несколько минут: ${reason}`);
    return;
  }

  try {
    await send(reply);
  } catch (e: any) {
    console.error(`${tag} не удалось отправить ответ: ${e?.message}`);
    throw e;
  }
  console.log(`${tag} ответ отправлен (${reply.length} симв., на ${pending.split("\n").length} сообщ.)`);

  await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
  await countBotReply(company, notifyDexaAdmins);
  await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, [...before, { role: "user", text: pending }], reply, company);
}
