import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

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
    awaitingPassword?: boolean;
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

const PENDING_AUTH_TTL_MS = 10 * 60_000;

function cleanupPendingTelegramAuth() {
  const now = Date.now();
  pendingTelegramAuth.forEach((entry, key) => {
    if (now - entry.createdAt > PENDING_AUTH_TTL_MS) {
      entry.client.disconnect().catch(() => {});
      pendingTelegramAuth.delete(key);
    }
  });
}

export async function startTelegramUserLogin(phoneNumber: string, apiId: number, apiHash: string) {
  cleanupPendingTelegramAuth();
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
  const resumingWith2fa = !!pendingAuth?.awaitingPassword && !!password?.trim();
  const lastUsedAt = usedTelegramAuthHashes.get(authHashId);
  if (!resumingWith2fa && lastUsedAt && Date.now() - lastUsedAt < 30_000) {
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
    // Код уже принят (Telegram ответил SESSION_PASSWORD_NEEDED) — повторно его слать нельзя,
    // остаётся только ввести пароль 2FA.
    if (!resumingWith2fa) {
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
    } else {
      throw Object.assign(new Error("SESSION_PASSWORD_NEEDED"), { errorMessage: "SESSION_PASSWORD_NEEDED" });
    }
  } catch (error: any) {
    if (error?.errorMessage === "SESSION_PASSWORD_NEEDED" || error?.message === "SESSION_PASSWORD_NEEDED") {
      if (!password || !password.trim()) {
        if (pendingAuth) pendingAuth.awaitingPassword = true;
        throw new Error("Нужен пароль двухфакторной авторизации Telegram. Введите его и нажмите «Подтвердить» ещё раз.");
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

  // КРИТИЧНО: закрываем login-клиент. Постоянный слушатель поднимется с этой же
  // session string; два одновременных соединения на один auth key дают
  // AUTH_KEY_DUPLICATED, и Telegram может аннулировать сессию.
  await client.disconnect().catch(() => {});

  return {
    ok: true,
    sessionString: savedSession,
    username: me?.username ?? "",
    firstName: (me as any)?.firstName ?? "",
    lastName: (me as any)?.lastName ?? "",
  };
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
