import { createHmac } from "node:crypto";
import { createAdminClient } from "./supabase/server";
import { backendUrl, frontendUrl } from "./urls";
import { sendToEmployee } from "./dexa-bot";
import { leadWordsRu } from "./company-settings";

/**
 * Уведомления о новых заявках в Telegram.
 *
 * Куда уходит заявка:
 *   1. TELEGRAM_LEADS_CHAT_ID — группа менеджеров (основной получатель);
 *   2. TELEGRAM_OWNER_CHAT_ID — владелец в личку, если задан (дубль);
 *   3. дополнительные получатели со страницы «Настройки» (app_settings).
 * Если в группу отправить не удалось, владелец получает заявку с пометкой,
 * чтобы она не потерялась.
 *
 * Токен бота: со страницы «Настройки», иначе TELEGRAM_LEADS_BOT_TOKEN.
 * Бот может написать человеку, только если тот нажал /start; в группу — если бот в ней состоит.
 */

const SETTINGS_KEY = "lead_notifications";
const TIME_ZONE = "Asia/Tashkent";

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

export function groupChatId() {
  return process.env.TELEGRAM_LEADS_CHAT_ID?.trim() || null;
}

export function ownerChatId() {
  return process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || null;
}

/** Итоговые токен и получатели без повторов: группа, владелец, дополнительные. */
export function resolveTarget(s: LeadNotifySettings) {
  const token = s.bot_token || process.env.TELEGRAM_LEADS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
  const group = groupChatId();
  const owner = ownerChatId();
  const extra = s.chat_ids.filter((id) => id !== group && id !== owner);
  const tokenSource: "settings" | "env" | "none" = s.bot_token ? "settings" : token ? "env" : "none";
  return { token, group, owner, extra, chatIds: [group, owner, ...extra].filter(Boolean) as string[], tokenSource };
}

/** Юзернеймы ботов по правилам Telegram заканчиваются на "bot". */
export function looksLikeBot(id: string) {
  return /^@\w*bot$/i.test(id);
}

/** Числовой ID пользователя/группы (-100…) или @username канала. */
export function isValidChatId(id: string) {
  return /^-?\d{3,}$/.test(id) || /^@[A-Za-z0-9_]{4,}$/.test(id);
}

export async function tgCall(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description ?? `HTTP ${res.status}`);
  return data.result;
}

function humanizeError(msg: string) {
  if (/chat not found/i.test(msg)) return "Чат не найден: проверьте ID и что получатель нажал /start в боте.";
  if (/bot was blocked/i.test(msg)) return "Получатель заблокировал бота.";
  if (/can't initiate conversation|bot can't initiate/i.test(msg)) return "Получатель должен сначала нажать /start в боте.";
  if (/unauthorized/i.test(msg)) return "Неверный токен бота.";
  return msg;
}

/** Тестовое сообщение всем получателям; результат по каждому. */
export async function sendToLeadChats(text: string, settings?: LeadNotifySettings) {
  const s = settings ?? (await getLeadNotifySettings());
  const { token, chatIds } = resolveTarget(s);
  if (!token) return [{ chat_id: "", ok: false, error: "Не задан токен бота." }];
  if (chatIds.length === 0) return [{ chat_id: "", ok: false, error: "Не указан ни один получатель." }];

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

// ---------------------------------------------------------------------
// Вебхук бота заявок: нужен, чтобы получать нажатия кнопки «✅ Ishga oldim»
// ---------------------------------------------------------------------

/** Секрет вебхука выводится из токена: Telegram присылает его в заголовке каждого запроса. */
export function leadsBotSecret(token: string) {
  return createHmac("sha256", token).update("radius-leads-bot").digest("hex");
}

export function leadsBotWebhookUrl() {
  return backendUrl("/api/telegram/leads-bot");
}

/** Направляет вебхук бота заявок на наш обработчик (если он смотрит не туда). */
export async function ensureLeadsBotWebhook() {
  const url = leadsBotWebhookUrl();
  // Локальный запуск не должен перехватывать вебхук боевого бота.
  if (!url.startsWith("https://")) return;
  const { token } = resolveTarget(await getLeadNotifySettings());
  if (!token) return;
  const info = await tgCall(token, "getWebhookInfo");
  if (info?.url === url) return;
  await tgCall(token, "setWebhook", {
    url,
    secret_token: leadsBotSecret(token),
    allowed_updates: ["callback_query", "message", "my_chat_member"],
  });
  console.log(`[leads-bot] вебхук бота заявок направлен на ${url} (был: ${info?.url || "нет"})`);
}

// Пока у бота вебхук, getUpdates не работает: для «Найти мой ID» запоминаем, кто писал боту.
const recentChats = new Map<string, { id: string; title: string; type: string }>();

export function rememberChat(chat: any) {
  if (!chat?.id) return;
  const title =
    chat.title ?? ([chat.first_name, chat.last_name].filter(Boolean).join(" ") || (chat.username ? `@${chat.username}` : String(chat.id)));
  recentChats.delete(String(chat.id));
  recentChats.set(String(chat.id), { id: String(chat.id), title, type: chat.type });
  if (recentChats.size > 50) recentChats.delete(recentChats.keys().next().value as string);
}

/** Последние чаты, писавшие боту, — чтобы найти свой ID без сторонних ботов. */
export async function findRecentChats(token: string) {
  try {
    const updates: any[] = await tgCall(token, "getUpdates?limit=100&allowed_updates=%5B%22message%22%2C%22my_chat_member%22%5D");
    for (const u of updates) rememberChat(u.message?.chat ?? u.my_chat_member?.chat);
  } catch (e: any) {
    if (!/webhook/i.test(e?.message ?? "")) throw e;
  }
  return [...recentChats.values()].reverse();
}

export async function getBotUsername(token: string) {
  const me = await tgCall(token, "getMe");
  return me.username as string;
}

// ---------------------------------------------------------------------
// Сообщение о заявке
// ---------------------------------------------------------------------

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatTashkent(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const TAKE_PREFIX = "take:";

/**
 * Текст сообщения по данным из БД — один и тот же для отправки и для
 * обновления после «✅ Ishga oldim». HTML: упоминание ответственного
 * (ему приходит уведомление) и ссылка на заявку в панели.
 */
export async function renderLeadMessage(leadId: string) {
  const supabase = createAdminClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, client_name, client_phone, collected_data, taken_by, taken_at, telegram_messages, " +
        "managers(name, telegram_id), chat_sessions(accounts(platform, account_name))"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) return null;

  const d = lead.collected_data ?? {};
  const acc = lead.chat_sessions?.accounts;
  const source = acc ? `${acc.platform === "telegram" ? "Telegram" : "Instagram"} · ${acc.account_name}` : "";
  const manager = lead.managers;
  const responsible = manager
    ? manager.telegram_id
      ? `<a href="tg://user?id=${manager.telegram_id}">${escapeHtml(manager.name)}</a>`
      : escapeHtml(manager.name)
    : "не назначен";
  const link = frontendUrl(`/leads?lead=${lead.id}`);

  const lines = [
    "📦 Yangi ariza keldi!",
    `👤 Mijoz: ${escapeHtml(lead.client_name || "Noma'lum")}`,
    `📞 Telefon: ${escapeHtml(lead.client_phone || "ko'rsatilmagan")}`,
    `🛣️ Yo'nalish: ${escapeHtml(d.origin_city || "—")} → ${escapeHtml(d.destination_city || "—")}`,
    `⚖️ Vazn: ${escapeHtml(d.weight || "—")}`,
    `📦 Yuk turi: ${escapeHtml(d.cargo_type || "—")}`,
    ...(source ? [`📲 Manba: ${escapeHtml(source)}`] : []),
    `👨‍💼 Ответственный: ${responsible}`,
    "",
    `👉 <a href="${escapeHtml(link)}">Ariza panelida ko'rib chiqing</a>`,
  ];
  if (lead.taken_by && lead.taken_at) {
    lines.push("", `✅ Ishga oldi: ${escapeHtml(lead.taken_by)}, ${formatTashkent(lead.taken_at)}`);
  }

  return {
    text: lines.join("\n"),
    taken: Boolean(lead.taken_at),
    messages: (lead.telegram_messages ?? []) as { chat_id: string; message_id: number }[],
  };
}

export function takeKeyboard(leadId: string) {
  return { inline_keyboard: [[{ text: "✅ Ishga oldim", callback_data: `${TAKE_PREFIX}${leadId}` }]] };
}

/** Уведомление о новой заявке. Ошибки не роняют обработку сообщения клиента. */
export async function notifyNewLead(leadId: string) {
  try {
    const settings = await getLeadNotifySettings();
    if (!settings.enabled) return;
    const { token, group, owner, extra } = resolveTarget(settings);
    if (!token) return console.warn("[Lead Telegram Notify] не задан токен бота — заявка не отправлена");

    const message = await renderLeadMessage(leadId);
    if (!message) return;

    const sent: { chat_id: string; message_id: number }[] = [];
    const send = async (chat_id: string, text: string) => {
      const result = await tgCall(token, "sendMessage", {
        chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: takeKeyboard(leadId),
      });
      sent.push({ chat_id, message_id: result.message_id });
    };

    let groupFailed = !group;
    if (group) {
      try {
        await send(group, message.text);
      } catch (e: any) {
        groupFailed = true;
        console.error(`[Lead Telegram Notify] в группу ${group} не отправилось: ${e?.message}`);
      }
    } else {
      console.warn("[Lead Telegram Notify] TELEGRAM_LEADS_CHAT_ID не задан — в группу не отправляю");
    }

    // Владелец получает дубль всегда, а если группа не сработала — с пометкой.
    const ownerText = groupFailed && group ? `⚠️ В группу заявка не отправилась\n\n${message.text}` : message.text;
    for (const chat_id of [owner, ...extra].filter(Boolean) as string[]) {
      try {
        await send(chat_id, chat_id === owner ? ownerText : message.text);
      } catch (e: any) {
        console.error(`[Lead Telegram Notify] chat ${chat_id}: ${e?.message}`);
      }
    }
    if (sent.length === 0) console.error(`[Lead Telegram Notify] заявка ${leadId.slice(0, 8)} никуда не отправлена`);

    const { error } = await createAdminClient().from("leads").update({ telegram_messages: sent }).eq("id", leadId);
    if (error) console.error("[Lead Telegram Notify] не удалось сохранить id сообщений:", error.message);
  } catch (error: any) {
    console.error("[Lead Telegram Notify] failed:", error?.message);
  }
}

/**
 * Партнёр (модуль «Партнёры»), например водитель: в ту же Telegram-группу заявок,
 * без ответственного и без кнопки «Взять в работу». У компаний без группы — руководителю
 * в личный Telegram через бота DexaAI. Ошибка отправки партнёра не теряет — он есть в базе.
 */
export async function notifyPartner(leadId: string, company: { id: string; lead_kind: string; telegram_leads: boolean; settings: { partners: { label: string } } }) {
  try {
    const supabase = createAdminClient();
    const { data: lead } = await supabase.from("leads").select("id, client_name, client_phone, collected_data").eq("id", leadId).maybeSingle();
    if (!lead) return;
    const d = lead.collected_data ?? {};
    const cargo = company.lead_kind === "cargo";
    const lines = [
      `${cargo ? "🚚" : "🤝"} <b>${escapeHtml(company.settings.partners.label.toUpperCase())}</b>`,
      `${cargo ? "Машина" : "Предлагает"}: ${escapeHtml(d.partner_offer || "—")}`,
      `Направления: ${escapeHtml(d.partner_directions || "—")}`,
      `Телефон: ${escapeHtml(lead.client_phone || "—")}`,
    ];
    if (lead.client_name) lines.push(`Имя: ${escapeHtml(lead.client_name)}`);
    const text = lines.join("\n");
    const keyboard = { inline_keyboard: [[{ text: "Чат", url: frontendUrl(`/partners?lead=${lead.id}`) }]] };

    if (company.telegram_leads) {
      const { token, group, owner } = resolveTarget(await getLeadNotifySettings());
      const chat = group ?? owner;
      if (token && chat) {
        await tgCall(token, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard });
        return;
      }
    }
    // Импорт здесь же: dexa-bot сам импортирует tgCall из этого файла (цикл безопасен — вызов не на верхнем уровне).
    const { data: owners } = await supabase.from("app_users").select("telegram_id").eq("company_id", company.id).eq("role", "owner").not("telegram_id", "is", null);
    for (const o of owners ?? []) await sendToEmployee(o.telegram_id, text, keyboard.inline_keyboard[0][0]);
  } catch (e: any) {
    console.error(`[Partner Notify] ${leadId.slice(0, 8)}: ${e?.message}`);
  }
}

/**
 * Новая заявка у компании без своей Telegram-группы (у всех, кроме Radius): руководителю
 * в личный Telegram через бота DexaAI. Ответственный менеджер узнаёт о ней из напоминания
 * «У вас новая заявка» (lib/reminders.ts). Ошибка отправки заявку не теряет — она уже в CRM.
 */
export async function notifyNewLeadPersonal(leadId: string, company: { id: string; settings: { terms: Parameters<typeof leadWordsRu>[0] } }) {
  try {
    const supabase = createAdminClient();
    const { data: lead } = await supabase.from("leads").select("id, client_name, client_phone, collected_data").eq("id", leadId).maybeSingle();
    if (!lead) return;
    const d = lead.collected_data ?? {};
    const W = leadWordsRu(company.settings.terms);
    const lines = [`🆕 <b>${W.New}</b>`, `👤 ${escapeHtml(lead.client_name || "Клиент")}${lead.client_phone ? ` · ${escapeHtml(lead.client_phone)}` : ""}`];
    if (d.origin_city || d.destination_city) lines.push(`🛣 ${escapeHtml(d.origin_city || "—")} → ${escapeHtml(d.destination_city || "—")}`);
    const cargo = [d.cargo_type, d.weight].filter(Boolean).join(" · ");
    if (cargo) lines.push(`📦 ${escapeHtml(cargo)}`);
    if (d.request) lines.push(`📝 ${escapeHtml(d.request)}`);
    const { data: owners } = await supabase.from("app_users").select("telegram_id").eq("company_id", company.id).eq("role", "owner").eq("is_active", true).not("telegram_id", "is", null);
    for (const o of owners ?? []) await sendToEmployee(o.telegram_id, lines.join("\n"), { text: `Открыть ${W.acc}`, url: frontendUrl(`/leads?lead=${lead.id}`) });
  } catch (e: any) {
    console.error(`[Lead Notify] ${leadId.slice(0, 8)}: ${e?.message}`);
  }
}
