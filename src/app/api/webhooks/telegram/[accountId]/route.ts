import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "@/lib/gemini";
import { getOrCreateSession, getHistory, maybeCreateOrUpdateLead } from "@/lib/conversation";

/**
 * Webhook для конкретного Telegram-аккаунта.
 *
 * URL: POST /api/webhooks/telegram/{accountId}
 * accountId — id строки в таблице accounts (виден на странице «Аккаунты»,
 * кнопка «Скопировать Webhook URL» формирует именно этот адрес).
 *
 * Bot Token НЕ читается из .env — он загружается из accounts.access_token
 * по accountId из URL, поэтому один и тот же код обслуживает произвольное
 * количество независимо подключённых Telegram-ботов.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const supabase = createAdminClient();

  try {
    const { data: account } = await supabase
      .from("accounts")
      .select("id, platform, account_name, access_token, status")
      .eq("id", params.accountId)
      .eq("platform", "telegram")
      .maybeSingle();

    if (!account || !account.access_token) {
      // Неизвестный или неподключённый аккаунт — тихо игнорируем апдейт,
      // чтобы Telegram не долбил ретраями.
      return NextResponse.json({ ok: true });
    }

    const update = await req.json();
    const msg = update.message;
    if (!msg?.text || !msg?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const session = await getOrCreateSession(
      supabase,
      account.id,
      String(msg.chat.id),
      msg.chat.first_name ?? msg.chat.username ?? "Клиент Telegram"
    );

    await supabase.from("messages").insert({ session_id: session.id, sender: "user", text: msg.text });

    // Менеджер уже ведёт диалог — ИИ не вмешивается.
    if (session.status === "manager_takeover") {
      return NextResponse.json({ ok: true });
    }

    const history = await getHistory(supabase, session.id);
    const systemInstruction = await buildSystemInstruction(msg.text);
    const reply = await sendToGemini(systemInstruction, history, msg.text);

    await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
    await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, history, reply);

    // Токен аккаунта берётся из БД, а не из процессных переменных окружения.
    await sendTelegramMessage(account.access_token, msg.chat.id, reply);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json({ ok: true });
    }
    console.error("[webhooks/telegram] error:", err);
    return NextResponse.json({ ok: true });
  }
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
