import { createAdminClient } from "./supabase/server";

/**
 * Уведомления о новых заявках в Telegram-бота.
 * Настройки лежат в app_settings (key = 'lead_notifications') и меняются со
 * страницы «Настройки» дашборда. Переменные окружения — запасной вариант:
 *   TELEGRAM_LEADS_BOT_TOKEN (или TELEGRAM_BOT_TOKEN), TELEGRAM_LEADS_CHAT_ID.
 *
 * Важно: бот может написать пользователю, только если тот хотя бы раз нажал
 * /start в этом боте. В группу/канал — только если бот туда добавлен.
 */

const SETTINGS_KEY = "lead_notifications";

export type LeadNotifySettings = {
  enabled: boolean;
  bot_token: string;
  chat_ids: string[];
};

const DEFAULTS: LeadNotifySettings = { enabled: true, bot_token: "", chat_ids: [] };

// Кэш на 30 с: заявка не должна ждать лишний запрос в БД, а смена настроек
// сбрасывает кэш сразу (saveLeadNotifySettings).
let cache: { at: number; value: LeadNotifySettings } | null = null;

export async function getLeadNotifySettings(): Promise<LeadNotifySettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  // Таблицы ещё нет (миграция не применена) — работаем на переменных окружения.
  const value: LeadNotifySettings = { ...DEFAULTS, ...(error ? {} : data?.value ?? {}) };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveLeadNotifySettings(value: LeadNotifySettings) {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = null;
}

/** Итоговые токен и получатели: настройки из дашборда, иначе .env. */
export function resolveTarget(s: LeadNotifySettings) {
  const token = s.bot_token || process.env.TELEGRAM_LEADS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
  const envChat = process.env.TELEGRAM_LEADS_CHAT_ID?.trim();
  const chatIds = s.chat_ids.length ? s.chat_ids : envChat ? [envChat] : [];
  const tokenSource: "settings" | "env" | "none" = s.bot_token ? "settings" : token ? "env" : "none";
  return { token, chatIds, tokenSource };
}

/** Юзернеймы ботов по правилам Telegram заканчиваются на "bot". */
export function looksLikeBot(id: string) {
  return /^@\w*bot$/i.test(id);
}

/** Числовой ID пользователя/группы (-100…) или @username канала. */
export function isValidChatId(id: string) {
  return /^-?\d{3,}$/.test(id) || /^@[A-Za-z0-9_]{4,}$/.test(id);
}

async function tgCall(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description ?? `HTTP ${res.status}`);
  return data.result;
}

/** Отправляет текст всем получателям; возвращает результат по каждому. */
export async function sendToLeadChats(text: string, settings?: LeadNotifySettings) {
  const s = settings ?? (await getLeadNotifySettings());
  const { token, chatIds } = resolveTarget(s);
  if (!token) return [{ chat_id: "", ok: false, error: "Не задан токен бота." }];
  if (chatIds.length === 0) {
    console.warn("[Lead Telegram Notify] не указан ни один получатель — заявка не отправлена");
    return [{ chat_id: "", ok: false, error: "Не указан ни один получатель." }];
  }

  return Promise.all(
    chatIds.map(async (chat_id) => {
      try {
        await tgCall(token, "sendMessage", { chat_id, text, disable_web_page_preview: true });
        return { chat_id, ok: true as const };
      } catch (e: any) {
        console.error(`[Lead Telegram Notify] chat ${chat_id}: ${e?.message}`);
        return { chat_id, ok: false as const, error: humanizeError(e?.message ?? "") };
      }
    })
  );
}

function humanizeError(msg: string) {
  if (/chat not found/i.test(msg)) return "Чат не найден: проверьте ID и что получатель нажал /start в боте.";
  if (/bot was blocked/i.test(msg)) return "Получатель заблокировал бота.";
  if (/can't initiate conversation|bot can't initiate/i.test(msg)) return "Получатель должен сначала нажать /start в боте.";
  if (/unauthorized/i.test(msg)) return "Неверный токен бота.";
  return msg;
}

/** Последние чаты, писавшие боту, — чтобы найти свой ID без сторонних ботов. */
export async function findRecentChats(token: string) {
  const updates: any[] = await tgCall(token, "getUpdates?limit=100&allowed_updates=%5B%22message%22%2C%22my_chat_member%22%5D");
  const chats = new Map<string, { id: string; title: string; type: string }>();
  for (const u of updates) {
    const chat = u.message?.chat ?? u.my_chat_member?.chat;
    if (!chat) continue;
    const title =
      chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || (chat.username ? `@${chat.username}` : String(chat.id)));
    chats.set(String(chat.id), { id: String(chat.id), title, type: chat.type });
  }
  return [...chats.values()].reverse();
}

export async function getBotUsername(token: string) {
  const me = await tgCall(token, "getMe");
  return me.username as string;
}

/** Уведомление о новой заявке. Ошибки не роняют обработку сообщения клиента. */
export async function notifyNewLead(lead: {
  sessionId: string;
  clientName: string;
  clientPhone: string;
  collectedData: Record<string, any>;
  managerName: string | null;
}) {
  try {
    const settings = await getLeadNotifySettings();
    if (!settings.enabled) return;

    // Откуда пришёл клиент — помогает логисту понять, где отвечать.
    const { data: session } = await createAdminClient()
      .from("chat_sessions")
      .select("accounts(platform, account_name)")
      .eq("id", lead.sessionId)
      .maybeSingle();
    const acc = session?.accounts;
    const source = acc ? `${acc.platform === "telegram" ? "Telegram" : "Instagram"} · ${acc.account_name}` : "";

    const d = lead.collectedData ?? {};
    const text = [
      "📦 Yangi ariza keldi!",
      `👤 Mijoz: ${lead.clientName || "Noma'lum"}`,
      `📞 Telefon: ${lead.clientPhone || "ko'rsatilmagan"}`,
      `🛣️ Yo'nalish: ${d.origin_city || "—"} → ${d.destination_city || "—"}`,
      `⚖️ Vazn: ${d.weight || "—"}`,
      `📦 Yuk turi: ${d.cargo_type || "—"}`,
      ...(source ? [`📲 Manba: ${source}`] : []),
      `👨‍💼 Ответственный: ${lead.managerName || "не назначен"}`,
      "",
      "👉 Ariza panelida ko'rib chiqing.",
    ].join("\n");

    await sendToLeadChats(text, settings);
  } catch (error: any) {
    console.error("[Lead Telegram Notify] failed:", error?.message);
  }
}
