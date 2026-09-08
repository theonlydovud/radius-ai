import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "@/lib/gemini";
import { extractLeadFields, isLeadComplete } from "@/lib/lead-extraction";

/**
 * Webhook для Instagram Messaging API (Meta). GET используется Meta для
 * верификации подписки, POST — для входящих сообщений Direct.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await req.json();

    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const senderId: string | undefined = event.sender?.id;
        const text: string | undefined = event.message?.text;
        if (!senderId || !text) continue;

        const account = await getOrCreateAccount(supabase, "instagram", "Radius Logistics IG");
        const session = await getOrCreateSession(supabase, account.id, senderId, "Клиент Instagram");

        await supabase.from("messages").insert({ session_id: session.id, sender: "user", text });

        if (session.status === "manager_takeover") continue;

        const history = await getHistory(supabase, session.id);
        const systemInstruction = await buildSystemInstruction(text);
        const reply = await sendToGemini(systemInstruction, history, text);

        await supabase.from("messages").insert({ session_id: session.id, sender: "ai", text: reply });
        await maybeCreateOrUpdateLead(supabase, session.id, session.client_name, history, reply);
        await sendInstagramMessage(senderId, reply);
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

async function sendInstagramMessage(recipientId: string, text: string) {
  const token = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
  if (!token) return;
  await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
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
