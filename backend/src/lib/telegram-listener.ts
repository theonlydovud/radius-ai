import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { createAdminClient } from "./supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "./gemini";
import { getHistory, getOrCreateSession, maybeCreateOrUpdateLead } from "./conversation";
import { scheduleReply, splitPending } from "./burst";
import { isTelegramUserAccount, parseTelegramUserConfig } from "./telegram";

/**
 * Менеджер MTProto-слушателей (GramJS).
 *
 * Принципы:
 *  1. Один TelegramClient на аккаунт, живёт всё время жизни процесса.
 *     Входящие приходят пушем (NewMessage), а не опросом getDialogs.
 *  2. Всё состояние лежит в globalThis — один реестр на процесс, даже если
 *     модуль окажется загружен дважды (наследие сборки Next.js).
 *  3. Запуск идемпотентен: сколько бы раз его ни вызвали (старт сервера,
 *     watchdog, /api/init-listeners, добавление аккаунта) — второй клиент
 *     с той же сессией не создаётся (иначе AUTH_KEY_DUPLICATED).
 */

type AccountRow = {
  id: string;
  platform: string;
  account_name: string;
  access_token: string;
  webhook_verify_token?: string | null;
};

type Turn = { role: "user" | "model"; text: string };
type ChatMemory = { sessionId: string; turns: Turn[] };

type Registry = {
  /** Память диалогов: ключ `${accountId}:${chatId}` — у каждого чата своя, не пересекаются. */
  memory: Map<string, ChatMemory>;
  clients: Map<string, TelegramClient>;
  starting: Map<string, Promise<TelegramClient | null>>;
  seen: Map<string, Set<string>>;
  chatQueues: Map<string, Promise<void>>;
  watchdog?: NodeJS.Timeout;
};

const g = globalThis as unknown as { __radiusTg?: Registry };
const reg: Registry = (g.__radiusTg ??= {
  memory: new Map(),
  clients: new Map(),
  starting: new Map(),
  seen: new Map(),
  chatQueues: new Map(),
});

const MEMORY_TURNS = 40; // сколько последних реплик помним в каждом чате
const WATCHDOG_INTERVAL_MS = 60_000;
const SEEN_LIMIT = 500;
const SERVICE_USER_ID = "777000"; // служебные уведомления Telegram

function log(accountId: string, msg: string, extra?: unknown) {
  console.log(`[tg:${accountId.slice(0, 8)}] ${msg}`, extra ?? "");
}

async function setAccountStatus(accountId: string, status: "connected" | "error") {
  try {
    await createAdminClient().from("accounts").update({ status }).eq("id", accountId);
  } catch {
    /* статус — косметика, не роняем слушатель */
  }
}

/** Запустить (или вернуть уже запущенный) слушатель аккаунта. */
export async function ensureTelegramUserListener(
  _supabase: unknown,
  account: AccountRow
): Promise<TelegramClient | null> {
  const running = reg.clients.get(account.id);
  if (running) return running;

  const inFlight = reg.starting.get(account.id);
  if (inFlight) return inFlight;

  const config = parseTelegramUserConfig(account.webhook_verify_token ?? null);
  if (!config || !account.access_token) return null;

  const promise = (async () => {
    const client = new TelegramClient(
      new StringSession(account.access_token),
      Number(config.api_id),
      config.api_hash,
      { connectionRetries: Infinity, autoReconnect: true, retryDelay: 2000 }
    );

    try {
      await client.connect();
      await client.getMe(); // проверка авторизации — ОДИН раз, при старте
    } catch (err: any) {
      log(account.id, `connect failed: ${err?.errorMessage ?? err?.message}`);
      await client.disconnect().catch(() => {});
      await setAccountStatus(account.id, "error");
      return null;
    }

    reg.clients.set(account.id, client);
    reg.seen.set(account.id, new Set());

    // Обработчик навешивается один раз на клиента, а не на каждый запрос.
    client.addEventHandler(
      (event: NewMessageEvent) => {
        handleIncoming(account, client, event).catch((e) =>
          log(account.id, `handler error: ${e?.message}`)
        );
      },
      new NewMessage({ incoming: true })
    );

    await setAccountStatus(account.id, "connected");
    log(account.id, `listening (${account.account_name})`);
    return client;
  })().finally(() => reg.starting.delete(account.id));

  reg.starting.set(account.id, promise);
  return promise;
}

export async function stopTelegramUserListener(accountId: string) {
  const client = reg.clients.get(accountId);
  reg.clients.delete(accountId);
  reg.seen.delete(accountId);
  reg.memory.forEach((_v, k) => k.startsWith(`${accountId}:`) && reg.memory.delete(k));
  if (client) await client.disconnect().catch(() => {});
}

export function getRunningTelegramClient(accountId: string) {
  return reg.clients.get(accountId) ?? null;
}

/**
 * Поднимает слушатели для ВСЕХ user-аккаунтов из БД параллельно и запускает
 * watchdog (подхват новых/удалённых аккаунтов, реконнект). Идемпотентна.
 */
export async function startAllTelegramListeners() {
  const result = await syncListeners();

  if (!reg.watchdog) {
    reg.watchdog = setInterval(() => {
      syncListeners().catch((e) => console.error("[tg watchdog]", e?.message));
    }, WATCHDOG_INTERVAL_MS);
    reg.watchdog.unref?.();
  }
  return result;
}

async function syncListeners() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, platform, account_name, access_token, webhook_verify_token")
    .eq("platform", "telegram");

  if (error) throw new Error(error.message);

  const accounts = ((data ?? []) as AccountRow[]).filter((a) => isTelegramUserAccount(a));
  const activeIds = new Set(accounts.map((a) => a.id));

  // Аккаунт удалили из БД (или сменили тип) — гасим его клиент.
  const stale = Array.from(reg.clients.keys()).filter((id) => !activeIds.has(id));
  await Promise.all(stale.map((id) => stopTelegramUserListener(id)));

  // Параллельный запуск: медленный/битый аккаунт не задерживает остальные.
  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const existing = reg.clients.get(acc.id);
      if (existing) {
        if (!existing.connected) await existing.connect(); // watchdog-реконнект
        return existing;
      }
      return ensureTelegramUserListener(supabase, acc);
    })
  );

  const ok = results.filter((r) => r.status === "fulfilled" && r.value).length;
  return { total: accounts.length, listening: ok, failed: accounts.length - ok };
}

// ---------------------------------------------------------------------
// Обработка входящего сообщения
// ---------------------------------------------------------------------

async function handleIncoming(account: AccountRow, client: TelegramClient, event: NewMessageEvent) {
  const m = event.message;
  if (!m || m.out || !m.message) return;
  // Только личная переписка: peer обязан быть пользователем (не группа, не канал/супергруппа),
  // и сообщение не должно быть постом канала.
  if (!event.isPrivate || !(m.peerId instanceof Api.PeerUser) || m.post) return;

  const chatId = String(event.chatId);
  if (chatId === SERVICE_USER_ID) return;

  // Дедупликация (GramJS иногда присылает апдейт повторно после реконнекта).
  const seen = reg.seen.get(account.id) ?? new Set<string>();
  reg.seen.set(account.id, seen);
  const dedupeKey = `${chatId}:${m.id}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);

  // Очередь на чат: сообщения одного клиента — по порядку,
  // разные клиенты и разные аккаунты — параллельно.
  const queueKey = `${account.id}:${chatId}`;
  enqueue(queueKey, () => receiveMessage(account, client, event, chatId));
}

/** Действия по одному чату — строго по порядку. */
function enqueue(key: string, task: () => Promise<void>) {
  const prev = reg.chatQueues.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task)
    .catch((e) => log(key, `chat task error: ${e?.message ?? e}`))
    .finally(() => {
      if (reg.chatQueues.get(key) === next) reg.chatQueues.delete(key);
    });
  reg.chatQueues.set(key, next);
}

/**
 * Сообщение клиента: сразу в БД и в память чата, а ответ откладывается до
 * паузы в переписке (см. burst.ts) — на 3–4 сообщения подряд бот ответит один раз.
 */
async function receiveMessage(
  account: AccountRow,
  client: TelegramClient,
  event: NewMessageEvent,
  chatId: string
) {
  const m = event.message;
  const text = String(m.message);
  const supabase = createAdminClient();

  // Отправитель должен быть настоящим человеком: не бот, не удалённый аккаунт,
  // не мы сами, не служебный Telegram. Не удалось определить — молчим (безопаснее).
  const sender: any = await m.getSender().catch(() => null);
  if (!(sender instanceof Api.User)) return;
  if (sender.bot || sender.deleted || sender.self || String(sender.id) === SERVICE_USER_ID) return;
  const senderName: string =
    sender?.firstName || sender?.lastName || sender?.username || "Клиент Telegram";

  const peer = (await m.getInputChat().catch(() => null)) ?? m.peerId;
  client.markAsRead(peer as any).catch(() => {});

  const session = await getOrCreateSession(supabase, account.id, chatId, senderName);
  if (!session) return;

  const memKey = `${account.id}:${chatId}`;
  await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });

  if (session.status === "manager_takeover") {
    // Менеджер пишет сам — наша память устарела, после возврата ИИ перечитаем её из БД.
    reg.memory.delete(memKey);
    return;
  }

  // ПАМЯТЬ ЧАТА. Источник правды — БД, но горячая копия держится в памяти процесса.
  // Если памяти нет (старт/рестарт/другая сессия) — поднимаем из БД: только что
  // записанное сообщение уже попадёт в выборку.
  const memory = reg.memory.get(memKey);
  if (!memory || memory.sessionId !== session.id) {
    const turns = (await getHistory(supabase, session.id, MEMORY_TURNS)) as Turn[];
    reg.memory.set(memKey, { sessionId: session.id, turns });
  } else {
    memory.turns.push({ role: "user", text });
  }

  scheduleReply(memKey, () => enqueue(memKey, () => replyToChat(account, client, peer, chatId, session)));
}

/** Один ответ на все сообщения клиента после последнего ответа. */
async function replyToChat(
  account: AccountRow,
  client: TelegramClient,
  peer: unknown,
  chatId: string,
  session: { id: string; client_name: string }
) {
  const supabase = createAdminClient();
  const memKey = `${account.id}:${chatId}`;
  const t0 = Date.now();

  // Пока ждали паузу, менеджер мог перехватить диалог.
  const { data: current } = await supabase.from("chat_sessions").select("status").eq("id", session.id).maybeSingle();
  if (current?.status === "manager_takeover") {
    reg.memory.delete(memKey);
    return;
  }

  const memory = reg.memory.get(memKey);
  if (!memory) return;
  const { before, pending } = splitPending(memory.turns);
  if (!pending) return;

  // «Печатает…» — fire-and-forget, ответ не задерживает.
  client
    .invoke(new Api.messages.SetTyping({ peer: peer as any, action: new Api.SendMessageTypingAction() }))
    .catch(() => {});

  const historyForModel: Turn[] = before.slice(-MEMORY_TURNS);
  let reply: string;
  try {
    // Знания/правила именно ЭТОГО аккаунта (или его агента).
    const systemInstruction = await buildSystemInstruction(pending, account.id);
    reply = await sendToGemini(systemInstruction, historyForModel, pending);
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      log(account.id, "Gemini 429 — ответ пропущен");
      return;
    }
    throw err;
  }
  const tLlm = Date.now() - t0;
  const conversationForLead: Turn[] = [...before, { role: "user", text: pending }];
  const count = memory.turns.length - before.length;
  memory.turns.push({ role: "model", text: reply });
  if (memory.turns.length > MEMORY_TURNS * 2) memory.turns.splice(0, memory.turns.length - MEMORY_TURNS);
  log(account.id, `chat ${chatId}: ответ на ${count} сообщ., в памяти ${memory.turns.length} реплик`);

  // 1) СНАЧАЛА отправляем клиенту...
  try {
    await client.sendMessage(peer as any, { message: reply });
  } catch (err: any) {
    log(account.id, `sendMessage failed: ${err?.errorMessage ?? err?.message}`);
    return;
  }
  log(account.id, `reply sent in ${Date.now() - t0} ms (LLM: ${tLlm} ms)`);

  // 2) ...и только потом пишем в БД и извлекаем заявку.
  void (async () => {
    await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
    await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, conversationForLead, reply);
  })().catch((e) => log(account.id, `post-send error: ${e?.message}`));
}

/** Для /api/accounts/[id]/test: переиспользуем живой клиент, а не открываем 2-е соединение. */
export async function getTelegramUserInfoForAccount(account: AccountRow) {
  const client = reg.clients.get(account.id);
  if (client) {
    try {
      return { ok: true as const, me: await client.getMe() };
    } catch (e: any) {
      return { ok: false as const, message: e?.message ?? "Не удалось получить данные аккаунта." };
    }
  }
  const started = await ensureTelegramUserListener(null, account);
  if (!started) return { ok: false as const, message: "Не удалось подключиться по сохранённой сессии." };
  return { ok: true as const, me: await started.getMe() };
}
