import { extractLeadFields, isLeadComplete } from "@/lib/lead-extraction";

/**
 * Общие хелперы для вебхуков Instagram/Telegram: находят или создают
 * сессию диалога под конкретный аккаунт (уже загруженный из БД по
 * accountId из URL) и пишут сообщения/заявки. Токен платформы здесь не
 * участвует — он читается вызывающим route.ts из accounts.access_token.
 */

export async function getOrCreateSession(
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

export async function getHistory(supabase: any, sessionId: string) {
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

export async function maybeCreateOrUpdateLead(
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
