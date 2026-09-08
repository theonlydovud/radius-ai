import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "@/lib/gemini";
import { getOrCreateSession, getHistory, maybeCreateOrUpdateLead } from "@/lib/conversation";

/**
 * Webhook для конкретного Instagram-аккаунта.
 *
 * URL: GET/POST /api/webhooks/instagram/{accountId}
 * accountId — id строки в таблице accounts. Access Token и Webhook Verify
 * Token читаются из этой строки в Supabase, а не из .env — так каждый
 * подключённый Instagram-аккаунт полностью изолирован от остальных.
 *
 * GET используется Meta для верификации подписки (hub.challenge),
 * POST — для входящих сообщений Direct.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const supabase = createAdminClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, webhook_verify_token")
    .eq("id", params.accountId)
    .eq("platform", "instagram")
    .maybeSingle();

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    account &&
    mode === "subscribe" &&
    token &&
    token === account.webhook_verify_token
  ) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

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
      .eq("platform", "instagram")
      .maybeSingle();

    if (!account || !account.access_token) {
      return NextResponse.json({ ok: true });
    }

    const body = await req.json();

    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const senderId: string | undefined = event.sender?.id;
        const text: string | undefined = event.message?.text;
        if (!senderId || !text) continue;

        const session = await getOrCreateSession(supabase, account.id, senderId, "Клиент Instagram");

        await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });

        if (session.status === "manager_takeover") continue;

        const history = await getHistory(supabase, session.id);
        const systemInstruction = await buildSystemInstruction(text);
        const reply = await sendToGemini(systemInstruction, history, text);

        await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
        await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, history, reply);

        // Токен аккаунта берётся из БД, а не из процессных переменных окружения.
        await sendInstagramMessage(account.access_token, senderId, reply);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json({ ok: true });
    }
    console.error("[webhooks/instagram] error:", err);
    return NextResponse.json({ ok: true });
  }
}

async function sendInstagramMessage(pageAccessToken: string, recipientId: string, text: string) {
  await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
}
