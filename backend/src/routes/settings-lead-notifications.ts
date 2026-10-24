import {
  findRecentChats,
  getBotUsername,
  getLeadNotifySettings,
  isValidChatId,
  looksLikeBot,
  resolveTarget,
  saveLeadNotifySettings,
  sendToLeadChats,
} from "../lib/lead-notify";

/**
 * Настройки уведомлений о заявках в Telegram.
 *   GET    /api/settings/lead-notifications        — текущие настройки (токен маскирован)
 *   PUT    /api/settings/lead-notifications        — сохранить { enabled, chat_ids, bot_token? }
 *   POST   /api/settings/lead-notifications        — { action: "test" | "find_chats" }
 */

function maskToken(token: string) {
  if (!token) return "";
  const [id] = token.split(":");
  return `${id}:••••••••${token.slice(-4)}`;
}

async function publicView() {
  const s = await getLeadNotifySettings();
  const { token, chatIds, tokenSource } = resolveTarget(s);
  let botUsername: string | null = null;
  if (token) botUsername = await getBotUsername(token).catch(() => null);
  return {
    enabled: s.enabled,
    chat_ids: s.chat_ids,
    effective_chat_ids: chatIds,
    bot_token_preview: maskToken(token),
    token_source: tokenSource,
    bot_username: botUsername,
  };
}

export async function GET() {
  return Response.json({ data: await publicView() });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const current = await getLeadNotifySettings();

  const chatIds: string[] = Array.isArray(body.chat_ids)
    ? body.chat_ids.map((x: unknown) => String(x).trim()).filter(Boolean)
    : current.chat_ids;
  const bots = chatIds.filter(looksLikeBot);
  if (bots.length) {
    return Response.json(
      {
        error: `${bots.join(", ")} — это бот. Бот-отправитель задаётся токеном, а сюда указывается ID человека или группы, куда он будет присылать заявки (боты не могут писать ботам).`,
      },
      { status: 400 }
    );
  }
  const invalid = chatIds.filter((id) => !isValidChatId(id));
  if (invalid.length) {
    return Response.json(
      { error: `Неверный ID: ${invalid.join(", ")}. Нужен числовой ID (например 123456789 или -1001234567890) или @username канала.` },
      { status: 400 }
    );
  }

  // bot_token: не передан — оставляем как есть; "" — сбросить (вернуться к .env).
  let botToken = current.bot_token;
  if (typeof body.bot_token === "string") {
    botToken = body.bot_token.trim();
    if (botToken) {
      if (!/^\d+:[\w-]{30,}$/.test(botToken)) {
        return Response.json({ error: "Токен бота выглядит неверно (формат 123456:ABC…)." }, { status: 400 });
      }
      try {
        await getBotUsername(botToken);
      } catch {
        return Response.json({ error: "Telegram не принял токен бота." }, { status: 400 });
      }
    }
  }

  try {
    await saveLeadNotifySettings({
      enabled: body.enabled ?? current.enabled,
      chat_ids: [...new Set(chatIds)],
      bot_token: botToken,
    });
  } catch (e: any) {
    return Response.json(
      { error: `Не удалось сохранить: ${e?.message}. Выполните migration-lead-notifications.sql в Supabase.` },
      { status: 500 }
    );
  }
  return Response.json({ data: await publicView() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const settings = await getLeadNotifySettings();
  const { token } = resolveTarget(settings);
  if (!token) return Response.json({ error: "Сначала укажите токен бота." }, { status: 400 });

  if (body.action === "test") {
    const results = await sendToLeadChats(
      "✅ Radius AI: test xabar. Yangi arizalar shu yerga keladi.\n(Тестовое уведомление: новые заявки будут приходить сюда.)",
      settings
    );
    return Response.json({ data: results });
  }

  if (body.action === "find_chats") {
    try {
      return Response.json({ data: await findRecentChats(token) });
    } catch (e: any) {
      const msg = /webhook/i.test(e?.message ?? "")
        ? "У этого бота включён вебхук (он подключён как аккаунт-бот), поэтому список недоступен. Узнайте ID через @userinfobot."
        : /unauthorized/i.test(e?.message ?? "")
          ? "Неверный токен бота."
          : e?.message;
      return Response.json({ error: msg }, { status: 400 });
    }
  }

  return Response.json({ error: "Неизвестное действие." }, { status: 400 });
}
