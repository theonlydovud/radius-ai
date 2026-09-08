import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "@/lib/gemini";
import { extractLeadFields, isLeadComplete } from "@/lib/lead-extraction";

/**
 * Webhook для Telegram Bot API. Настраивается через
 * https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhooks/telegram
 *
 * Обрабатывает входящие сообщения так же, как песочница: собирает
 * системный промпт из БД, вызывает Gemini, сохраняет диалог и, если
 * все нужные поля собраны, создаёт заявку в leads.
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg?.text || !msg?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const account = await getOrCreateAccount(supabase, "telegram", "Radius Logistics Bot");
    const session = await getOrCreateSession(
      supabase,
      account.id,
      String(msg.chat.id),
      msg.chat.first_name ?? msg.chat.username ?? "Клиент Telegram"
    );

    await supabase.from("messages").insert({
      session_id: session.id,
      sender: "user",
      text: msg.text,
    });

    // Менеджер уже ведёт диалог — ИИ не вмешивается.
    if (session.status === "manager_takeover") {
      return NextResponse.json({ ok: true });
    }

    const history = await getHistory(supabase, session.id);
    const systemInstruction = await buildSystemInstruction(msg.text);
    const reply = await sendToGemini(systemInstruction, history, msg.text);

    await supabase.from("messages").insert({
      session_id: session.id,
      sender: "ai",
      text: reply,
    });

    await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, history, reply);
    await sendTelegramMessage(msg.chat.id, reply);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json({ ok: true });
    }
    console.error("[webhooks/telegram] error:", err);
    return NextResponse.json({ ok: true });
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function getOrCreateAccount(supabase: any, platform: string, name: string) {
  const { data: existing } = await supabase
    .from("accounts")
    .select("*")
    .eq("platform", platform)
    .eq("account_name", name)
    .maybeSingle();
  if (existing) return existing;

  const { data } = await supabase
    .from("accounts")
    .insert({ platform, account_name: name, access_token: "", status: "connected" })
    .select()
    .single();
  return data;
}

async function getOrCreateSession(
  supabase: any,
  accountId: string,
  clientId: string,
  clientName: string
) {
  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("account_id", accountId)
    .eq("client_id", clientId)
    .neq("status", "closed")
    .maybeSingle();
  if (existing) return existing;

  const { data } = await supabase
    .from("chat_sessions")
    .insert({ account_id: accountId, client_id: clientId, client_name: clientName, status: "ai_active" })
    .select()
    .single();
  return data;
}

async function getHistory(supabase: any, sessionId: string) {
  const { data } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  return (data ?? []).map((m: { sender: string; text: string }) => ({
    role: m.sender === "user" ? "user" : "model",
    text: m.text,
  }));
}

async function maybeCreateOrUpdateLead(
  supabase: any,
  sessionId: string,
  clientName: string,
  history: { role: string; text: string }[],
  latestReply: string
) {
  const conversation = history.map((h) => h.text).join("\n") + "\n" + latestReply;
  const fields = extractLeadFields(conversation);
  if (!isLeadComplete(fields)) return;

  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingLead) {
    await supabase
      .from("leads")
      .update({ collected_data: fields, client_phone: fields.phone ?? "" })
      .eq("id", existingLead.id);
    return;
  }

  await supabase.from("leads").insert({
    session_id: sessionId,
    client_name: clientName,
    client_phone: fields.phone ?? "",
    collected_data: {
      origin_city: fields.origin_city,
      destination_city: fields.destination_city,
      weight: fields.weight,
      cargo_type: fields.cargo_type,
    },
    status: "pending_quote",
  });
}
