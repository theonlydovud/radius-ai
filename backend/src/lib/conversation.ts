import { extractLeadFields, isLeadComplete } from "./lead-extraction";
import { extractLeadFieldsWithGemini } from "./gemini";
import { notifyNewLead } from "./lead-notify";

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

type LeadFields = Awaited<ReturnType<typeof extractLeadFieldsWithGemini>>;

/** Объединяет поля, не затирая найденное значениями undefined/null. */
function mergeFields(base: LeadFields, extra: Partial<LeadFields>): LeadFields {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(extra)) if (v) out[k] = v;
  return out;
}

async function extractFields(conversation: string): Promise<LeadFields> {
  let fields = extractLeadFields(conversation) as LeadFields;
  if (!isLeadComplete(fields)) {
    fields = mergeFields(fields, await extractLeadFieldsWithGemini(conversation));
  }
  return fields;
}

/**
 * Заявки диалога. В одном чате клиент может оставить несколько заявок, поэтому:
 *  - заявки ещё нет — анализируем историю, полный набор данных → новая заявка + уведомление;
 *  - заявка уже есть — анализируем ТОЛЬКО сообщения после неё (иначе регулярки
 *    цепляют старые данные со дна чата). Снова полный набор → НОВАЯ заявка +
 *    уведомление; только уточнения → дописываем пустые поля текущей заявки.
 */
export async function maybeCreateOrUpdateLead(
  supabase: any,
  sessionId: string,
  clientName: string,
  history: { role: string; text: string }[],
  latestReply: string
) {
  try {
    const { data: lastLeads, error: selectError } = await supabase
      .from("leads")
      .select("id, status, client_phone, collected_data, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (selectError) console.error("[Lead Extraction] Error selecting last lead:", selectError?.message);
    const lastLead = lastLeads?.[0] ?? null;

    let conversation: string;
    if (lastLead) {
      const { data: fresh } = await supabase
        .from("messages")
        .select("text")
        .eq("session_id", sessionId)
        .gt("created_at", lastLead.created_at)
        .order("created_at", { ascending: true });
      const texts: string[] = (fresh ?? []).map((m: { text: string }) => m.text);
      if (texts[texts.length - 1] !== latestReply) texts.push(latestReply);
      conversation = texts.join("\n");
    } else {
      conversation = history.map((h) => h.text).join("\n") + "\n" + latestReply;
    }

    const fields = await extractFields(conversation);
    console.log(`[Lead Extraction] session ${sessionId.slice(0, 8)}: ${lastLead ? "после последней заявки" : "новая"} →`, fields);

    if (isLeadComplete(fields)) {
      const { data: insertedLead, error: insertError } = await supabase
        .from("leads")
        .insert({
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
        })
        .select("id, client_name, client_phone, collected_data")
        .single();

      if (insertError) {
        console.error("[Lead Extraction] Error creating lead:", insertError?.message);
        return;
      }
      console.log("[Lead Extraction] Lead created:", insertedLead.id);

      // Получатели и токен бота настраиваются на странице «Настройки» дашборда.
      await notifyNewLead({
        sessionId,
        clientName: insertedLead.client_name || clientName,
        clientPhone: insertedLead.client_phone || fields.phone || "",
        collectedData: insertedLead.collected_data || {},
      });
      return;
    }

    // Неполный набор после существующей заявки — это уточнения к ней.
    if (lastLead && lastLead.status === "pending_quote") {
      const current = lastLead.collected_data ?? {};
      const patch: Record<string, string> = {};
      for (const k of ["origin_city", "destination_city", "weight", "cargo_type"] as const) {
        if (!current[k] && fields[k]) patch[k] = fields[k] as string;
      }
      const phone = !lastLead.client_phone && fields.phone ? fields.phone : null;
      if (Object.keys(patch).length || phone) {
        await supabase
          .from("leads")
          .update({
            collected_data: { ...current, ...patch },
            ...(phone ? { client_phone: phone } : {}),
          })
          .eq("id", lastLead.id);
        console.log("[Lead Extraction] Lead", lastLead.id, "дополнена:", { ...patch, ...(phone ? { phone } : {}) });
      }
    }
  } catch (error: any) {
    console.error("[Lead Extraction] Unexpected error:", error?.message);
  }
}
