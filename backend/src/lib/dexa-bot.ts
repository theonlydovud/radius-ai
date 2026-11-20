import { createHmac, randomBytes } from "node:crypto";
import { createAdminClient } from "./supabase/server";
import { tgCall } from "./lead-notify";
import { backendUrl } from "./urls";
import { invalidateAuthCache, TRIAL_DAYS } from "./auth";
import { DEFAULT_PLAN, findPlan, getPlans } from "./plans";
import { isPlatformAdmin } from "./platform";

/**
 * Бот DexaAI: регистрация и вход в один клик + база подписчиков для рассылок.
 *
 * Сайт просит одноразовый код (createSignup) и открывает t.me/<бот>?start=<код>.
 * Человек жмёт Start — бот находит по Telegram ID аккаунт или создаёт новый
 * (компания на пробном периоде: всё открыто 14 дней) и подтверждает код.
 * Сайт, опрашивая статус кода, видит подтверждение и входит (consumeSignup).
 *
 * Переменные: DEXA_BOT_TOKEN — токен бота от @BotFather;
 *             DEXA_ADMIN_CHAT_IDS — кому слать уведомления о регистрациях (через запятую).
 */

const CODE_TTL_MS = 20 * 60_000;

export function dexaBotToken() {
  return process.env.DEXA_BOT_TOKEN?.trim() || null;
}

export function dexaBotSecret(token: string) {
  return createHmac("sha256", token).update("dexa-bot").digest("hex");
}

let cachedUsername: string | null = null;
export async function dexaBotUsername() {
  if (cachedUsername) return cachedUsername;
  const token = dexaBotToken();
  if (!token) return null;
  const me = await tgCall(token, "getMe");
  cachedUsername = me?.username ?? null;
  return cachedUsername;
}

export async function ensureDexaBotWebhook() {
  const token = dexaBotToken();
  const url = backendUrl("/api/telegram/dexa-bot");
  if (!token || !url.startsWith("https://")) return;
  const info = await tgCall(token, "getWebhookInfo");
  if (info?.url === url) return;
  await tgCall(token, "setWebhook", { url, secret_token: dexaBotSecret(token), allowed_updates: ["message", "my_chat_member"] });
  console.log(`[dexa-bot] вебхук направлен на ${url}`);
}

// ---------------------------------------------------------------------
// Коды входа
// ---------------------------------------------------------------------

export async function createSignup(meta: { lang?: string; plan?: string; ip?: string; userAgent?: string }) {
  const username = await dexaBotUsername();
  if (!username) throw new Error("Бот DexaAI не настроен (DEXA_BOT_TOKEN).");
  const nonce = randomBytes(18).toString("base64url"); // 24 символа A-Za-z0-9_- — подходит для ?start=
  const { error } = await createAdminClient()
    .from("dexa_signups")
    .insert({ nonce, lang: meta.lang ?? null, ip: meta.ip ?? null, user_agent: meta.userAgent?.slice(0, 300) ?? null, ...(meta.plan ? { plan: meta.plan } : {}) });
  if (error) throw new Error(error.message);
  return { nonce, url: `https://t.me/${username}?start=${nonce}` };
}

export async function signupStatus(nonce: string) {
  const { data } = await createAdminClient().from("dexa_signups").select("created_at, confirmed_at, consumed_at").eq("nonce", nonce).maybeSingle();
  if (!data) return "unknown" as const;
  if (data.consumed_at) return "used" as const;
  if (Date.now() - Date.parse(data.created_at) > CODE_TTL_MS) return "expired" as const;
  return data.confirmed_at ? ("confirmed" as const) : ("waiting" as const);
}

/** Сайт входит по подтверждённому коду. Код одноразовый. */
export async function consumeSignup(nonce: string) {
  const supabase = createAdminClient();
  const { data } = await supabase.from("dexa_signups").select("id, created_at, confirmed_at, consumed_at, user_id, is_new, telegram_id").eq("nonce", nonce).maybeSingle();
  if (!data || !data.confirmed_at || data.consumed_at) return null;
  const platform = !data.user_id && (await isPlatformAdmin(data.telegram_id));
  if (!data.user_id && !platform) return null;
  if (Date.now() - Date.parse(data.created_at) > CODE_TTL_MS) return null;
  // Условие consumed_at IS NULL: два одновременных запроса не войдут оба.
  const { data: used } = await supabase
    .from("dexa_signups")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!used) return null;
  if (platform) return { platform: String(data.telegram_id) } as const;
  const { data: user } = await supabase.from("app_users").select("*").eq("id", data.user_id).maybeSingle();
  if (!user) return null;
  const { data: company } = await supabase.from("companies").select("*").eq("id", user.company_id).maybeSingle();
  if (!company) return null;
  return { user, company, isNew: !!data.is_new };
}

// ---------------------------------------------------------------------
// Бот
// ---------------------------------------------------------------------

type Lang = "ru" | "uz" | "en";
const langOf = (code?: string | null): Lang => (code?.startsWith("uz") ? "uz" : code?.startsWith("en") ? "en" : "ru");

const TEXT: Record<string, Record<Lang, string>> = {
  welcomeNew: {
    ru: "🎉 Добро пожаловать в DexaAI!\n\nАккаунт создан: 14 дней бесплатно. Вернитесь во вкладку браузера — вход выполнится автоматически.",
    uz: "🎉 DexaAI’ga xush kelibsiz!\n\nAkkaunt yaratildi: 14 kun bepul. Brauzerdagi sahifaga qayting — kirish avtomatik bajariladi.",
    en: "🎉 Welcome to DexaAI!\n\nYour account is ready: 14 days free. Go back to the browser tab — you'll be signed in automatically.",
  },
  welcomeBack: {
    ru: "✅ Вход подтверждён. Вернитесь во вкладку браузера.",
    uz: "✅ Kirish tasdiqlandi. Brauzerdagi sahifaga qayting.",
    en: "✅ Sign-in confirmed. Go back to the browser tab.",
  },
  expired: {
    ru: "⌛ Ссылка устарела. Нажмите «Войти через Telegram» на сайте ещё раз.",
    uz: "⌛ Havola eskirgan. Saytda «Telegram orqali kirish» tugmasini yana bosing.",
    en: "⌛ This link has expired. Press “Continue with Telegram” on the website again.",
  },
  plain: {
    ru: "👋 Это бот DexaAI — ИИ-менеджера для Instagram Direct.\n\nЗарегистрироваться: https://dexa.uz/register",
    uz: "👋 Bu DexaAI boti — Instagram Direct uchun SI-menejer.\n\nRo‘yxatdan o‘tish: https://dexa.uz/register",
    en: "👋 This is the DexaAI bot — an AI manager for Instagram Direct.\n\nSign up: https://dexa.uz/register",
  },
  askPhone: {
    ru: "Оставьте номер телефона — так мы сможем связаться с вами по подключению.",
    uz: "Telefon raqamingizni qoldiring — ulanish bo‘yicha siz bilan bog‘lanamiz.",
    en: "Share your phone number so we can contact you about getting connected.",
  },
  phoneButton: { ru: "📱 Поделиться номером", uz: "📱 Raqamni yuborish", en: "📱 Share phone number" },
  thanksPhone: { ru: "Спасибо! Номер сохранён.", uz: "Rahmat! Raqam saqlandi.", en: "Thanks! Your number is saved." },
};

async function send(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  const token = dexaBotToken();
  if (!token) return;
  await tgCall(token, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, ...extra }).catch((e) =>
    console.error(`[dexa-bot] не отправилось ${chatId}: ${e?.message}`)
  );
}

/** Уведомление владельцу DexaAI (DEXA_ADMIN_CHAT_IDS). */
export async function notifyDexaAdmins(text: string) {
  const ids = (process.env.DEXA_ADMIN_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  await Promise.all(ids.map((id) => send(id, text, { parse_mode: "HTML" })));
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function rememberBotUser(from: any) {
  await createAdminClient()
    .from("dexa_bot_users")
    .upsert(
      {
        telegram_id: from.id,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
        username: from.username ?? null,
        language_code: from.language_code ?? null,
        last_seen_at: new Date().toISOString(),
        blocked: false,
      },
      { onConflict: "telegram_id" }
    );
}

/** Аккаунт по Telegram ID; нет — новая компания в статусе pending и её владелец. */
async function accountFor(from: any, planCode?: string | null) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("app_users").select("id").eq("telegram_id", from.id).maybeSingle();
  if (existing) return { userId: existing.id as string, isNew: false, plan: null };

  const person = [from.first_name, from.last_name].filter(Boolean).join(" ") || (from.username ? `@${from.username}` : "Владелец");
  const plan = findPlan(await getPlans(), planCode ?? DEFAULT_PLAN);
  const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  const { data: company, error: ce } = await supabase
    .from("companies")
    .insert({
      name: "Моя компания",
      status: "trial",
      // Пробный период идёт на тарифе, выбранном при регистрации: его функции и его лимит сообщений.
      plan: plan.code,
      period_start: new Date().toISOString(),
      period_end: trialEnd,
      trial_ends_at: trialEnd,
      profile: { contact_name: person, telegram: from.username ? `@${from.username}` : null } })
    .select("id")
    .single();
  if (ce) throw new Error(ce.message);
  const { data: user, error: ue } = await supabase
    .from("app_users")
    .insert({ company_id: company.id, name: person, role: "owner", telegram_id: from.id, is_active: true, sort_order: 0 })
    .select("id")
    .single();
  if (ue) throw new Error(ue.message);
  invalidateAuthCache();
  return { userId: user.id as string, isNew: true, plan: plan.name };
}

export async function handleDexaBotUpdate(update: any) {
  const supabase = createAdminClient();

  // Остановил или вернул бота — для рассылок.
  const member = update?.my_chat_member;
  if (member?.chat?.type === "private") {
    const blocked = ["kicked", "left"].includes(member.new_chat_member?.status);
    await supabase.from("dexa_bot_users").update({ blocked }).eq("telegram_id", member.from.id);
    return;
  }

  const msg = update?.message;
  if (!msg?.from || msg.chat?.type !== "private") return;
  const from = msg.from;
  const lang = langOf(from.language_code);
  await rememberBotUser(from);

  // Номер телефона (кнопка «Поделиться номером»): принимаем только свой.
  if (msg.contact) {
    if (msg.contact.user_id === from.id) {
      await supabase.from("dexa_bot_users").update({ phone: msg.contact.phone_number }).eq("telegram_id", from.id);
      const { data: user } = await supabase.from("app_users").select("company_id").eq("telegram_id", from.id).maybeSingle();
      if (user) {
        const { data: company } = await supabase.from("companies").select("profile").eq("id", user.company_id).maybeSingle();
        const profile = { ...(company?.profile ?? {}) };
        if (!profile.phone) {
          profile.phone = msg.contact.phone_number;
          await supabase.from("companies").update({ profile }).eq("id", user.company_id);
        }
      }
      await send(from.id, TEXT.thanksPhone[lang], { reply_markup: { remove_keyboard: true } });
      await notifyDexaAdmins(`📱 Телефон от ${esc(from.first_name)} ${from.username ? `@${esc(from.username)}` : ""}: <b>${esc(msg.contact.phone_number)}</b>`);
    }
    return;
  }

  const text: string = msg.text ?? "";
  const start = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{8,64}))?/);
  if (!start) {
    await send(from.id, TEXT.plain[lang]);
    return;
  }
  const nonce = start[1];
  if (!nonce) {
    await send(from.id, TEXT.plain[lang]);
    return;
  }
  if (nonce.startsWith("link_")) {
    await linkEmployee(from, nonce.slice(5), lang);
    return;
  }

  const { data: signup } = await supabase.from("dexa_signups").select("*").eq("nonce", nonce).maybeSingle();
  if (!signup || signup.confirmed_at || Date.now() - Date.parse(signup.created_at) > CODE_TTL_MS) {
    await send(from.id, TEXT.expired[lang]);
    return;
  }

  // Владелец платформы входит без своей компании: дальше на сайте он выберет любую.
  if (await isPlatformAdmin(from.id)) {
    await supabase
      .from("dexa_signups")
      .update({ confirmed_at: new Date().toISOString(), telegram_id: from.id, user_id: null, is_new: false })
      .eq("id", signup.id)
      .is("confirmed_at", null);
    await send(from.id, "🔑 Вход владельца DexaAI подтверждён. Вернитесь во вкладку браузера и выберите компанию.");
    return;
  }

  const { userId, isNew, plan } = await accountFor(from, signup.plan);
  await supabase
    .from("dexa_signups")
    .update({ confirmed_at: new Date().toISOString(), telegram_id: from.id, user_id: userId, is_new: isNew })
    .eq("id", signup.id)
    .is("confirmed_at", null);

  if (isNew) {
    await send(from.id, TEXT.welcomeNew[lang]);
    await send(from.id, TEXT.askPhone[lang], {
      reply_markup: { keyboard: [[{ text: TEXT.phoneButton[lang], request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
    });
    await notifyDexaAdmins(
      `🆕 <b>Новая регистрация в DexaAI</b> — тариф ${plan}, пробный период ${TRIAL_DAYS} дней\n${esc([from.first_name, from.last_name].filter(Boolean).join(" "))}` +
        `${from.username ? ` · @${esc(from.username)}` : ""}\nTelegram ID: <code>${from.id}</code>\nЯзык: ${esc(from.language_code ?? "—")}`
    );
  } else {
    await send(from.id, TEXT.welcomeBack[lang]);
  }
}


// ---------------------------------------------------------------------
// Привязка личного Telegram сотрудника (напоминания по заявкам)
// ---------------------------------------------------------------------

const LINK_TEXT: Record<string, Record<Lang, string>> = {
  ok: {
    ru: "✅ Telegram подключён. Сюда будут приходить напоминания по вашим заявкам — только в рабочее время.",
    uz: "✅ Telegram ulandi. Arizalaringiz bo‘yicha eslatmalar shu yerga keladi — faqat ish vaqtida.",
    en: "✅ Telegram connected. Reminders about your leads will arrive here — during working hours only.",
  },
  taken: {
    ru: "Этот Telegram уже привязан к другому сотруднику DexaAI. Отвяжите его там или войдите с другого Telegram.",
    uz: "Bu Telegram boshqa DexaAI xodimiga ulangan. U yerda uzing yoki boshqa Telegram’dan kiring.",
    en: "This Telegram is already linked to another DexaAI user. Unlink it there or use another Telegram account.",
  },
};

async function linkEmployee(from: any, code: string, lang: Lang) {
  const supabase = createAdminClient();
  const { data: link } = await supabase.from("telegram_links").select("nonce, user_id, created_at, used_at").eq("nonce", code).maybeSingle();
  if (!link || link.used_at || Date.now() - Date.parse(link.created_at) > CODE_TTL_MS) {
    await send(from.id, TEXT.expired[lang]);
    return;
  }
  const { data: other } = await supabase.from("app_users").select("id").eq("telegram_id", from.id).maybeSingle();
  if (other && other.id !== link.user_id) {
    await send(from.id, LINK_TEXT.taken[lang]);
    return;
  }
  const { data: user, error } = await supabase.from("app_users").update({ telegram_id: from.id }).eq("id", link.user_id).select("manager_id").maybeSingle();
  if (error || !user) {
    console.error(`[dexa-bot] привязка Telegram не удалась: ${error?.message ?? "нет пользователя"}`);
    await send(from.id, TEXT.expired[lang]);
    return;
  }
  await supabase.from("telegram_links").update({ used_at: new Date().toISOString() }).eq("nonce", code);
  // У менеджера — тот же ID в очереди: упоминание в группе заявок и запасной адрес напоминаний.
  if (user.manager_id) await supabase.from("managers").update({ telegram_id: from.id }).eq("id", user.manager_id);
  invalidateAuthCache();
  await send(from.id, LINK_TEXT.ok[lang]);
}

/** Сообщение сотруднику от бота DexaAI. Кнопка — ссылка на карточку заявки. false — не дошло. */
export async function sendToEmployee(chatId: number | string, html: string, button?: { text: string; url: string }) {
  const token = dexaBotToken();
  if (!token) return false;
  try {
    await tgCall(token, "sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    });
    return true;
  } catch (e: any) {
    console.warn(`[dexa-bot] сотруднику ${chatId} не отправлено: ${e?.message}`);
    return false;
  }
}
