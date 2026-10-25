import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "./supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "./gemini";
import { getHistory, getOrCreateSession, maybeCreateOrUpdateLead } from "./conversation";
import { backendUrl } from "./urls";

/**
 * Instagram Direct через «Instagram API with Instagram Login» (graph.instagram.com).
 * Facebook-страница не нужна: бизнес/автор-аккаунт Instagram логинится напрямую.
 *
 * Поток:
 *  1. /api/auth/instagram → окно входа Instagram → /api/auth/instagram/callback
 *  2. code → короткий токен → долгий токен (60 дней), его продлевает refreshInstagramTokens()
 *  3. /me/subscribed_apps — подписка аккаунта на вебхук `messages`
 *  4. Meta шлёт ВСЕ события приложения на ОДИН URL /api/webhooks/instagram,
 *     аккаунт находим по entry.id == accounts.platform_account_id.
 *
 * Старые аккаунты с Page Access Token (EAA…) продолжают работать через graph.facebook.com.
 */

// Без версии Graph API использует версию по умолчанию из настроек приложения в Meta.
const VERSION = process.env.INSTAGRAM_GRAPH_VERSION ? `/${process.env.INSTAGRAM_GRAPH_VERSION}` : "";
const IG_GRAPH = `https://graph.instagram.com${VERSION}`;
const FB_GRAPH = `https://graph.facebook.com${VERSION}`;
const MAX_MESSAGE_LEN = 1000; // лимит длины текста в Instagram Direct
export const SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];

const RATE_LIMIT_REPLY = "Слишком большая нагрузка на сервера, повторите попытку через 1-2 минуты.";

/** Токены Instagram Login начинаются с IG…, Page Access Token — с EAA…. */
function isInstagramLoginToken(token: string) {
  return token.startsWith("IG");
}

async function graph(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const msg = data?.error?.message ?? data?.error_message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ---------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------

export function instagramRedirectUri() {
  return backendUrl("/api/auth/instagram/callback");
}

/** state подписываем секретом приложения: в нём едет выбранный агент, подделать нельзя. */
export function signState(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ ...payload, n: randomBytes(8).toString("hex") })).toString("base64url");
  const sig = createHmac("sha256", process.env.INSTAGRAM_APP_SECRET ?? "").update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string | null): Record<string, any> | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", process.env.INSTAGRAM_APP_SECRET ?? "").update(body).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

export function instagramAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: instagramRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
    // Всегда спрашиваем логин/пароль: так в браузере, где открыт другой
    // Instagram, не привяжется случайно не тот аккаунт.
    force_reauth: "true",
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

/** code → долгоживущий (60 дней) токен. */
export async function exchangeCodeForToken(rawCode: string) {
  // Instagram дописывает к code "#_" — это не часть кода.
  const code = rawCode.replace(/#_$/, "");
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: instagramRedirectUri(),
    code,
  });
  const short = await graph("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  // Ответ бывает и плоским, и обёрнутым в data[] — поддерживаем оба формата.
  const shortToken: string | undefined = short.access_token ?? short.data?.[0]?.access_token;
  if (!shortToken) throw new Error("Instagram не вернул access_token.");

  const long = await graph(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
      process.env.INSTAGRAM_APP_SECRET ?? ""
    )}&access_token=${encodeURIComponent(shortToken)}`
  );
  return long.access_token as string;
}

// ---------------------------------------------------------------------
// Аккаунт
// ---------------------------------------------------------------------

export type InstagramProfile = { platform_account_id: string; username: string };

/**
 * Проверяет токен и возвращает ID аккаунта, который приходит в вебхуках (entry.id).
 * Для Instagram Login это поле user_id (не id — тот app-scoped).
 */
export async function getInstagramProfile(token: string): Promise<InstagramProfile> {
  if (isInstagramLoginToken(token)) {
    const me = await graph(`${IG_GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
    return { platform_account_id: String(me.user_id ?? me.id), username: me.username ?? "" };
  }
  // Page Access Token: берём привязанный к странице Instagram Business аккаунт.
  const page = await graph(
    `${FB_GRAPH}/me?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
  );
  const ig = page.instagram_business_account;
  if (!ig) throw new Error(`К странице «${page.name}» не привязан Instagram Business аккаунт.`);
  return { platform_account_id: String(ig.id), username: ig.username ?? page.name ?? "" };
}

/** Подписывает аккаунт на вебхук messages (без этого Meta не шлёт события). */
export async function subscribeInstagramWebhooks(token: string) {
  const host = isInstagramLoginToken(token) ? IG_GRAPH : FB_GRAPH;
  await graph(
    `${host}/me/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(token)}`,
    { method: "POST" }
  );
}

/** На какие поля вебхука аккаунт подписан на стороне Meta (для диагностики). */
export async function getInstagramSubscriptions(token: string): Promise<string[]> {
  const host = isInstagramLoginToken(token) ? IG_GRAPH : FB_GRAPH;
  const r = await graph(`${host}/me/subscribed_apps?access_token=${encodeURIComponent(token)}`);
  const rows: any[] = r.data ?? [];
  return [...new Set(rows.flatMap((row) => row.subscribed_fields ?? []))].map(String);
}

/** Полная проверка/подготовка аккаунта: профиль + подписка на вебхуки. */
export async function connectInstagramAccount(token: string) {
  const profile = await getInstagramProfile(token);
  await subscribeInstagramWebhooks(token);
  return profile;
}

/**
 * Долгий токен живёт 60 дней. Продлеваем все токены Instagram Login раз в сутки
 * (Meta разрешает продление токена, которому больше 24 часов — остальные ошибки игнорируем).
 */
export async function refreshInstagramTokens() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("accounts").select("id, access_token").eq("platform", "instagram");
  for (const acc of (data ?? []) as { id: string; access_token: string }[]) {
    if (!acc.access_token || !isInstagramLoginToken(acc.access_token)) continue;
    try {
      const r = await graph(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
          acc.access_token
        )}`
      );
      if (r.access_token) await supabase.from("accounts").update({ access_token: r.access_token }).eq("id", acc.id);
    } catch (e: any) {
      console.warn(`[ig:${acc.id.slice(0, 8)}] token refresh skipped: ${e?.message}`);
    }
  }
}

// ---------------------------------------------------------------------
// Отправка
// ---------------------------------------------------------------------

function splitMessage(text: string) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_MESSAGE_LEN) {
    let cut = rest.lastIndexOf("\n", MAX_MESSAGE_LEN);
    if (cut < MAX_MESSAGE_LEN / 2) cut = rest.lastIndexOf(" ", MAX_MESSAGE_LEN);
    if (cut < MAX_MESSAGE_LEN / 2) cut = MAX_MESSAGE_LEN;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendInstagramMessage(token: string, recipientId: string, text: string) {
  const host = isInstagramLoginToken(token) ? IG_GRAPH : FB_GRAPH;
  for (const part of splitMessage(text)) {
    await graph(`${host}/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: part } }),
    });
  }
}

// ---------------------------------------------------------------------
// Вебхук
// ---------------------------------------------------------------------

/**
 * Проверка подписи X-Hub-Signature-256. Meta подписывает тело секретом приложения;
 * принимаем любой из настроенных секретов. Если ни один не задан — не проверяем.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null) {
  const secrets = [process.env.INSTAGRAM_APP_SECRET, process.env.FACEBOOK_APP_SECRET].filter(Boolean) as string[];
  if (secrets.length === 0) return true;
  if (!header?.startsWith("sha256=")) return false;
  const got = Buffer.from(header.slice(7));
  return secrets.some((s) => {
    const expected = Buffer.from(createHmac("sha256", s).update(rawBody).digest("hex"));
    return expected.length === got.length && timingSafeEqual(expected, got);
  });
}

type IgAccount = { id: string; account_name: string; access_token: string };
type IgEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[]; is_deleted?: boolean };
  [key: string]: unknown;
};

/** Что за событие пришло, если в нём нет текста — для логов. */
function describeEvent(event: IgEvent, field?: string) {
  if (event.read) return "прочтение (messaging_seen)";
  if (event.reaction) return "реакция на сообщение";
  if (event.postback) return "нажатие кнопки (postback)";
  if (event.referral) return "переход по ссылке (referral)";
  if (event.message_edit) return "редактирование сообщения";
  if (event.message?.is_deleted) return "удаление сообщения";
  if (event.message?.attachments) return "вложение (фото/видео/стикер/голосовое)";
  return `неизвестное событие${field ? ` (поле ${field})` : ""}: ${JSON.stringify(event).slice(0, 400)}`;
}

const g = globalThis as unknown as {
  __radiusIg?: { seen: Set<string>; queues: Map<string, Promise<void>>; names: Map<string, string> };
};
const reg = (g.__radiusIg ??= { seen: new Set(), queues: new Map(), names: new Map() });

/**
 * Разбирает тело вебхука и ставит сообщения в очередь. Возвращает сразу:
 * Meta ждёт 200 быстро, иначе повторяет доставку.
 */
export async function handleInstagramWebhook(body: any, fixedAccountId?: string) {
  if (body?.object && body.object !== "instagram" && body.object !== "page") return;
  const supabase = createAdminClient();

  for (const entry of body?.entry ?? []) {
    // Реальные события приходят в messaging[], тестовые из кабинета Meta — в changes[].
    const changes: any[] = entry.changes ?? [];
    for (const c of changes.filter((c) => c.field !== "messages")) {
      console.log(`[ig] событие поля «${c.field}» — не сообщение, пропускаю`);
    }
    const events: IgEvent[] = entry.messaging ?? changes.filter((c) => c.field === "messages").map((c) => c.value);

    for (const event of events) {
      const senderId = event.sender?.id;
      const text = event.message?.text;
      if (event.message?.is_echo) continue; // echo = наш же ответ
      if (!senderId || !text) {
        console.log(`[ig] пропущено (нет текста): ${describeEvent(event)}`);
        continue;
      }
      if (senderId === String(entry.id)) continue;

      const mid = event.message?.mid ?? `${senderId}:${text}`;
      if (reg.seen.has(mid)) continue;
      reg.seen.add(mid);
      if (reg.seen.size > 2000) reg.seen.delete(reg.seen.values().next().value as string);

      let q = supabase.from("accounts").select("id, account_name, access_token").eq("platform", "instagram");
      q = fixedAccountId
        ? q.eq("id", fixedAccountId)
        : q.in("platform_account_id", [String(entry.id), event.recipient?.id].filter(Boolean));
      const { data: accounts } = await q.limit(1);
      const account: IgAccount | undefined = accounts?.[0];
      if (!account?.access_token) {
        console.warn(`[ig] нет аккаунта для entry.id=${entry.id} — подключите его во вкладке «Аккаунты»`);
        continue;
      }

      // Сообщения одного клиента — строго по порядку, разные клиенты — параллельно.
      const key = `${account.id}:${senderId}`;
      const next = (reg.queues.get(key) ?? Promise.resolve())
        .catch(() => {})
        .then(() => processInstagramMessage(account, senderId, text))
        .catch((e: any) => console.error(`[ig:${account.id.slice(0, 8)}] ${e?.message ?? e}`))
        .finally(() => {
          if (reg.queues.get(key) === next) reg.queues.delete(key);
        });
      reg.queues.set(key, next);
    }
  }
}

async function clientName(token: string, senderId: string) {
  const cached = reg.names.get(senderId);
  if (cached) return cached;
  let name = "Клиент Instagram";
  try {
    if (isInstagramLoginToken(token)) {
      const u = await graph(`${IG_GRAPH}/${senderId}?fields=username,name&access_token=${encodeURIComponent(token)}`);
      name = u.name || (u.username ? `@${u.username}` : name);
    }
  } catch {
    /* профиль может быть недоступен — не критично */
  }
  reg.names.set(senderId, name);
  return name;
}

async function processInstagramMessage(account: IgAccount, senderId: string, text: string) {
  const supabase = createAdminClient();
  const session = await getOrCreateSession(supabase, account.id, senderId, await clientName(account.access_token, senderId));
  if (!session) return;

  // История ДО записи текущего сообщения, иначе оно уйдёт в модель дважды.
  const history = await getHistory(supabase, session.id);
  await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });
  if (session.status === "manager_takeover") {
    console.log(`[ig:${account.id.slice(0, 8)}] диалог у менеджера — ИИ не отвечает`);
    return;
  }

  let reply: string;
  try {
    const systemInstruction = await buildSystemInstruction(text, account.id);
    reply = await sendToGemini(systemInstruction, history, text);
  } catch (err) {
    if (!(err instanceof GeminiRateLimitError)) throw err;
    reply = RATE_LIMIT_REPLY;
  }

  const tag = `[ig:${account.id.slice(0, 8)}]`;
  console.log(`${tag} сообщение от ${senderId}: «${text.slice(0, 60)}»`);
  try {
    await sendInstagramMessage(account.access_token, senderId, reply);
  } catch (e: any) {
    console.error(`${tag} не удалось отправить ответ: ${e?.message}`);
    throw e;
  }
  console.log(`${tag} ответ отправлен (${reply.length} симв.)`);
  await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
  if (reply !== RATE_LIMIT_REPLY) {
    await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, [...history, { role: "user", text }], reply);
  }
}
