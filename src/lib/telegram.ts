import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { buildSystemInstruction, sendToGemini } from "@/lib/gemini";
import { getHistory, getOrCreateSession, maybeCreateOrUpdateLead } from "@/lib/conversation";

const activeUserClients = new Map<string, TelegramClient>();

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

  return {
    ok: true,
    phoneCodeHash: result.phoneCodeHash,
    isCodeViaApp: result.isCodeViaApp,
    phoneNumber,
  };
}

export async function finishTelegramUserLogin(
  phoneNumber: string,
  apiId: number,
  apiHash: string,
  phoneCode: string,
  password?: string
) {
  const client = new TelegramClient(new StringSession(""), Number(apiId), apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  const user = await client.signInUser(
    { apiId: Number(apiId), apiHash },
    {
      phoneNumber,
      phoneCode: async () => phoneCode,
      password: async () => (password && password.trim() ? password : ""),
      onError: (error) => {
        throw error;
      },
    }
  );

  const sessionString = client.session.save();

  return {
    ok: true,
    sessionString,
    username: (user as any)?.username ?? "",
    firstName: "firstName" in (user ?? {}) ? (user as any).firstName ?? "" : "",
    lastName: "lastName" in (user ?? {}) ? (user as any).lastName ?? "" : "",
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

  await client.connect();
  await client.getMe();

  client.addEventHandler(async (event: any) => {
    const msg = event?.message;
    if (!msg || msg.out || !msg.text || !msg.chatId) return;

    const text = String(msg.text);
    const session = await getOrCreateSession(
      supabase,
      account.id,
      String(msg.chatId),
      (msg.sender?.firstName ?? msg.sender?.username ?? account.account_name) || "Клиент Telegram"
    );

    await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });

    if (session.status === "manager_takeover") return;

    const history = await getHistory(supabase, session.id);
    const systemInstruction = await buildSystemInstruction(text);
    const reply = await sendToGemini(systemInstruction, history, text);

    await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
    await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, history, reply);

    await client.sendMessage(msg.chatId, { message: reply });
  }, new NewMessage({ outgoing: false }));

  activeUserClients.set(account.id, client);
  return client;
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
