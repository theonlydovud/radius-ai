import { extractLeadFields, isLeadComplete } from "@/lib/lead-extraction";
import { extractLeadFieldsWithGemini } from "@/lib/gemini";

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
  // Берём самую свежую незакрытую сессию ЭТОГО клиента в ЭТОМ аккаунте.
  // Раньше здесь был .maybeSingle(): при двух и более открытых сессиях он
  // возвращает ошибку, existing становился null, и на КАЖДОЕ сообщение
  // создавалась новая сессия — отсюда «бот не помнит предыдущие сообщения».
  const findOpen = async () => {
    const { data } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("account_id", accountId)
      .eq("client_id", clientId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  };

  const existing = await findOpen();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ account_id: accountId, client_id: clientId, client_name: clientName, status: "ai_active" })
    .select()
    .single();

  // Гонка: параллельный запрос успел создать сессию раньше — берём её.
  if (error) return findOpen();
  return data;
}

/**
 * Последние `limit` сообщений сессии в хронологическом порядке.
 * Раньше было order(asc).limit(20) — это ПЕРВЫЕ 20 сообщений диалога,
 * и после 20-го бот переставал видеть свежую переписку.
 */
export async function getHistory(supabase: any, sessionId: string, limit = 40) {
  const { data } = await supabase
    .from("messages")
    .select("sender, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as { sender: string; text: string }[])
    .reverse()
    .map((m) => ({
      role: (m.sender === "user" ? "user" : "model") as "user" | "model",
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
  try {
    const conversation = history.map((h) => h.text).join("\n") + "\n" + latestReply;
    
    // Сначала пробуем быстрое извлечение с регулярными выражениями
    let fields = extractLeadFields(conversation);
    console.log("[Lead Extraction] Regex extracted fields:", fields);
    
    // Если регулярные выражения не дали полных данных, используем Gemini
    if (!isLeadComplete(fields)) {
      console.log("[Lead Extraction] Trying Gemini extraction...");
      const geminiFields = await extractLeadFieldsWithGemini(conversation);
      fields = { ...fields, ...geminiFields }; // Меджим результаты: Gemini может дополнить regex
      console.log("[Lead Extraction] Gemini extracted fields:", geminiFields);
    }
    
    console.log("[Lead Extraction] Final fields:", fields);
    if (!isLeadComplete(fields)) {
      console.log("[Lead Extraction] Lead not complete. Missing:", {
        origin_city: !fields.origin_city,
        destination_city: !fields.destination_city,
        weight: !fields.weight,
        phone: !fields.phone,
      });
      return;
    }
    console.log("[Lead Extraction] Lead is complete! Creating/updating...");

    const { data: existingLead, error: selectError } = await supabase
      .from("leads")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (selectError) {
      console.error("[Lead Extraction] Error selecting existing lead:", selectError?.message);
    }

    if (existingLead) {
      console.log("[Lead Extraction] Updating existing lead:", existingLead.id);
      const { error: updateError } = await supabase
        .from("leads")
        .update({ collected_data: fields, client_phone: fields.phone ?? "" })
        .eq("id", existingLead.id);
      
      if (updateError) {
        console.error("[Lead Extraction] Error updating lead:", updateError?.message);
        return;
      }
      console.log("[Lead Extraction] Lead updated successfully");
      return;
    }

    console.log("[Lead Extraction] Creating new lead for session:", sessionId);
    const { error: insertError } = await supabase.from("leads").insert({
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

    if (insertError) {
      console.error("[Lead Extraction] Error creating lead:", insertError?.message);
      return;
    }
    console.log("[Lead Extraction] Lead created successfully");
  } catch (error: any) {
    console.error("[Lead Extraction] Unexpected error:", error?.message);
  }
}
