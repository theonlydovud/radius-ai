import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { buildSystemInstruction, sendToGemini } from "@/lib/gemini";
import { getHistory, getOrCreateSession, maybeCreateOrUpdateLead } from "@/lib/conversation";

const activeUserClients = new Map<string, TelegramClient>();
const pollingIntervals = new Map<string, NodeJS.Timeout>();
const processedMessageIds = new Map<string, Set<number>>();
const pendingTelegramAuth = new Map<
  string,
  {
    apiId: number;
    apiHash: string;
    phoneNumber: string;
    phoneCodeHash: string;
    sessionString: string;
    createdAt: number;
    client: TelegramClient;
  }
>();
const usedTelegramAuthHashes = new Map<string, number>();

function normalizeTelegramPhoneNumber(phoneNumber: string) {
  return phoneNumber.replace(/\s+/g, "").replace(/^\+/, "");
}

function getPendingTelegramAuthKey(phoneNumber: string, apiId: number, apiHash: string) {
  return `${apiId}:${apiHash}:${normalizeTelegramPhoneNumber(phoneNumber)}`;
}

export type TelegramUserConfig = {
  auth_type: "user";
  api_id: number;
  api_hash: string;
  phone_number?: string;
};

export function parseTelegramUserConfig(raw: string | null | undefined): TelegramUserConfig | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.auth_type === "user" && parsed.api_id && parsed.api_hash) {
      return {
        auth_type: "user",
        api_id: Number(parsed.api_id),
        api_hash: String(parsed.api_hash),
        phone_number: parsed.phone_number ? String(parsed.phone_number) : undefined,
      };
    }
  } catch {
    // ignored: old records may not contain JSON config yet.
  }

  return null;
}

export function serializeTelegramUserConfig(config: TelegramUserConfig) {
  return JSON.stringify({
    auth_type: config.auth_type,
    api_id: config.api_id,
    api_hash: config.api_hash,
    phone_number: config.phone_number ?? null,
  });
}

export function isTelegramUserAccount(account: { webhook_verify_token?: string | null; platform?: string }) {
  if (account.platform !== "telegram") return false;
  return !!parseTelegramUserConfig(account.webhook_verify_token ?? null);
}

export async function startTelegramUserLogin(phoneNumber: string, apiId: number, apiHash: string) {
  const client = new TelegramClient(new StringSession(""), Number(apiId), apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  const result = await client.sendCode({ apiId: Number(apiId), apiHash }, phoneNumber);
  const sessionString = (client.session as StringSession).save();

  const key = getPendingTelegramAuthKey(phoneNumber, apiId, apiHash);
  pendingTelegramAuth.set(key, {
    apiId: Number(apiId),
    apiHash,
    phoneNumber,
    phoneCodeHash: result.phoneCodeHash,
    sessionString,
    createdAt: Date.now(),
    client,
  });

  return {
    ok: true,
    phoneCodeHash: result.phoneCodeHash,
    isCodeViaApp: result.isCodeViaApp,
    phoneNumber,
    sessionString,
  };
}

export async function finishTelegramUserLogin(
  phoneNumber: string,
  apiId: number,
  apiHash: string,
  phoneCode: string,
  password?: string,
  phoneCodeHash?: string,
  sessionString?: string
) {
  const pendingKey = getPendingTelegramAuthKey(phoneNumber, apiId, apiHash);
  const pendingAuth = pendingTelegramAuth.get(pendingKey);

  const resolvedHash = (phoneCodeHash ?? pendingAuth?.phoneCodeHash ?? "").trim();
  const resolvedSessionString = sessionString ?? pendingAuth?.sessionString ?? "";

  if (!resolvedHash) {
    throw new Error("Не удалось получить phoneCodeHash для Telegram auth.");
  }

  const authHashId = `${apiId}:${apiHash}:${normalizeTelegramPhoneNumber(phoneNumber)}:${resolvedHash}`;
  const lastUsedAt = usedTelegramAuthHashes.get(authHashId);
  if (lastUsedAt && Date.now() - lastUsedAt < 30_000) {
    throw new Error("Этот Telegram auth-код уже подтверждён. Попросите отправить новый код.");
  }

  usedTelegramAuthHashes.set(authHashId, Date.now());

  const client =
    pendingAuth?.client ??
    new TelegramClient(new StringSession(resolvedSessionString), Number(apiId), apiHash, {
      connectionRetries: 5,
    });

  await client.connect();

  try {
    const signInResult = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber,
        phoneCodeHash: resolvedHash,
        phoneCode,
      })
    );

    if (signInResult instanceof Api.auth.AuthorizationSignUpRequired) {
      throw new Error("Для этого Telegram-аккаунта требуется регистрация, а не вход.");
    }
  } catch (error: any) {
    if (error?.errorMessage === "SESSION_PASSWORD_NEEDED" || error?.message === "SESSION_PASSWORD_NEEDED") {
      if (!password || !password.trim()) {
        throw new Error("Нужен пароль двухфакторной авторизации Telegram.");
      }

      await client.signInWithPassword(
        { apiId: Number(apiId), apiHash },
        {
          password: async () => password,
          onError: (error) => {
            throw error;
          },
        }
      );
    } else if (error?.errorMessage === "PHONE_CODE_EXPIRED" || error?.message === "PHONE_CODE_EXPIRED") {
      throw new Error("Код Telegram истёк. Попросите отправить его заново.");
    } else {
      throw error;
    }
  }

  const me = await client.getMe();
  const savedSession = (client.session as StringSession).save();
  pendingTelegramAuth.delete(pendingKey);
  usedTelegramAuthHashes.delete(authHashId);

  return {
    ok: true,
    sessionString: savedSession,
    username: me?.username ?? "",
    firstName: (me as any)?.firstName ?? "",
    lastName: (me as any)?.lastName ?? "",
  };
}

export async function ensureTelegramUserListener(
  supabase: any,
  account: {
    id: string;
    platform: string;
    account_name: string;
    access_token: string;
    webhook_verify_token?: string | null;
  }
) {
  if (activeUserClients.has(account.id)) {
    return activeUserClients.get(account.id)!;
  }

  const config = parseTelegramUserConfig(account.webhook_verify_token ?? null);
  if (!config) return null;

  const client = new TelegramClient(
    new StringSession(account.access_token),
    Number(config.api_id),
    config.api_hash,
    { connectionRetries: 5 }
  );

  try {
    await client.connect();
    await client.getMe();
  } catch (error: any) {
    console.error(`[Telegram Listener] Failed to connect account ${account.id}:`, error?.message);
    return null;
  }

  activeUserClients.set(account.id, client);
  processedMessageIds.set(account.id, new Set());

  // Запускаем polling для проверки сообщений
  startPollingForAccount(supabase, account, client);

  return client;
}

/**
 * Polling функция для периодической проверки входящих сообщений User-аккаунта Telegram.
 * Запускается в фоне и проверяет новые сообщения каждые 3 секунды.
 */
function startPollingForAccount(
  supabase: any,
  account: { id: string; platform: string; account_name: string; access_token: string; webhook_verify_token?: string | null },
  client: TelegramClient
) {
  // Стопим старый polling если есть
  if (pollingIntervals.has(account.id)) {
    clearInterval(pollingIntervals.get(account.id)!);
  }

  const pollingInterval = setInterval(async () => {
    try {
      // Проверяем что клиент ещё подключен
      if (!client.connected) {
        console.log(`[Telegram Polling] Reconnecting account ${account.id}...`);
        try {
          await client.connect();
        } catch (e) {
          console.warn(`[Telegram Polling] Reconnect failed for ${account.id}`);
          return;
        }
      }

      // Получаем все диалоги
      const dialogs = await client.getDialogs({ limit: 100 });

      for (const dialog of dialogs) {
        try {
          const chatId = dialog.id;
          if (!chatId) continue; // Пропускаем если нет ID
          const unread = dialog.unreadCount || 0;
          
          // Конвертируем BigInteger в number для сравнения
          const chatIdNum = typeof chatId === "number" ? chatId : Number(chatId);

          // Только личные сообщения (chatId > 0), исключаем группы и каналы (chatId < 0)
          if (chatIdNum < 0) continue;

          if (unread === 0) continue;

          // Получаем последние сообщения из конверсации
          const messages = await client.getMessages(chatId, { limit: unread + 5 });

          for (const msg of messages) {
            if (!msg.text || msg.out) continue; // Пропускаем исходящие и пустые

            const msgId = msg.id;
            const processedSet = processedMessageIds.get(account.id) || new Set();

            if (processedSet.has(msgId)) continue; // Уже обработали
            processedSet.add(msgId);
            processedMessageIds.set(account.id, processedSet);

            const text = String(msg.text);
            const senderName =
              ((msg.sender as any)?.firstName || "") ||
              ((msg.sender as any)?.lastName || "") ||
              ((msg.sender as any)?.username || "") ||
              account.account_name ||
              "Клиент Telegram";

            console.log(`[Telegram Polling] New message from ${senderName} in chat ${chatId}: "${text.slice(0, 50)}..."`);

            // Создаем/получаем сессию
            const session = await getOrCreateSession(supabase, account.id, String(chatId), senderName);

            // Сохраняем входящее сообщение
            await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });

            // Пропускаем если менеджер takeover
            if (session.status === "manager_takeover") continue;

            // Получаем историю и отправляем в ИИ
            const history = await getHistory(supabase, session.id);
            const systemInstruction = await buildSystemInstruction(text);
            const reply = await sendToGemini(systemInstruction, history, text);

            // Сохраняем ответ ИИ
            await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
            
            // Пытаемся создать/обновить заявку
            try {
              console.log(`[Telegram Polling] About to extract lead for session ${session.id}`);
              await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, history, reply);
              console.log(`[Telegram Polling] Lead extraction completed for session ${session.id}`);
            } catch (leadErr: any) {
              console.error(`[Telegram Polling] Lead extraction error for session ${session.id}:`, leadErr?.message);
            }

            // Отправляем ответ в Telegram
            try {
              await client.sendMessage(dialog as any, { message: reply });
              console.log(`[Telegram Polling] Sent response to ${chatId}`);
            } catch (err: any) {
              console.error(`[Telegram Polling] Failed to send message to ${chatId}:`, err?.message);
            }
          }
        } catch (error: any) {
          console.error(`[Telegram Polling] Error processing dialog:`, error?.message);
        }
      }
    } catch (error: any) {
      console.error(`[Telegram Polling] Polling error for account ${account.id}:`, error?.message);
    }
  }, 10000); // Проверяем каждые 10 секунд (было 3 сек, но вызывает flood wait на Telegram)

  pollingIntervals.set(account.id, pollingInterval);
  console.log(`[Telegram Polling] Started polling for account ${account.id}`);
}

/**
 * Остановить polling для User-аккаунта Telegram
 */
export function stopTelegramUserPolling(accountId: string) {
  const interval = pollingIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(accountId);
    console.log(`[Telegram Polling] Stopped polling for account ${accountId}`);
  }

  const client = activeUserClients.get(accountId);
  if (client) {
    try {
      client.disconnect();
    } catch {
      // ignore disconnect errors
    }
    activeUserClients.delete(accountId);
  }

  processedMessageIds.delete(accountId);
}

export async function sendTelegramReplyByAccount(
  supabase: any,
  account: {
    id: string;
    platform: string;
    account_name: string;
    access_token: string;
    webhook_verify_token?: string | null;
  },
  chatId: number | string,
  text: string
) {
  const config = parseTelegramUserConfig(account.webhook_verify_token ?? null);

  if (!config) {
    return false;
  }

  const client = await ensureTelegramUserListener(supabase, account);
  if (!client) return false;

  await client.sendMessage(chatId, { message: text });
  return true;
}

export async function validateTelegramBotToken(botToken: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  return res.json();
}

export async function setTelegramBotWebhook(botToken: string, webhookUrl: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  );
  return res.json();
}

export async function getTelegramClientByAccount(account: {
  access_token: string;
  webhook_verify_token?: string | null;
}) {
  const config = parseTelegramUserConfig(account.webhook_verify_token ?? null);
  if (!config) {
    return null;
  }

  const client = new TelegramClient(
    new StringSession(account.access_token),
    Number(config.api_id),
    config.api_hash,
    { connectionRetries: 5 }
  );

  await client.connect();
  return client;
}

export async function getTelegramUserInfo(account: {
  access_token: string;
  webhook_verify_token?: string | null;
}) {
  const client = await getTelegramClientByAccount(account);
  if (!client) {
    return { ok: false, message: "Нет данных для MTProto авторизации." };
  }

  try {
    const me = await client.getMe();
    return { ok: true, me };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? "Не удалось получить информацию о Telegram-аккаунте." };
  }
}
