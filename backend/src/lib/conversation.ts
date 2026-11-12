import {
  extractPhone,
  isGenericLeadComplete,
  isLeadComplete,
  sanitizeGenericLead,
  sanitizeLeadFields,
  type ExtractedLeadFields,
} from "./lead-extraction";
import { extractGenericLeadWithGemini, extractLeadFieldsWithGemini } from "./gemini";
import type { AuthCompany } from "./auth";
import { notifyNewLead } from "./lead-notify";
import { assignNextManager } from "./managers";

/**
 * Общие хелперы для вебхуков Instagram: находят или создают
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

const LEAD_RETRY_ATTEMPTS = 5;
const LEAD_RETRY_DELAY_MS = Number(process.env.LEAD_RETRY_DELAY_MS || 60_000);

type Line = { who: "Клиент" | "Бот" | "Менеджер"; text: string };

function speaker(roleOrSender: string): Line["who"] {
  if (roleOrSender === "user") return "Клиент";
  if (roleOrSender === "manager") return "Менеджер";
  return "Бот";
}

/** Поля заявки: извлекает Gemini, телефон подстраховывается регуляркой по словам клиента. */
async function extractFields(lines: Line[]): Promise<ExtractedLeadFields | null> {
  const conversation = lines.map((l) => `${l.who}: ${l.text}`).join("\n");
  const clientText = lines.filter((l) => l.who === "Клиент").map((l) => l.text).join("\n");
  const ai = await extractLeadFieldsWithGemini(conversation);
  if (!ai) return null;
  return sanitizeLeadFields({ ...ai, phone: ai.phone ?? extractPhone(clientText) });
}

/**
 * Заявка в едином виде для обоих типов компаний:
 *   cargo   (Radius) — маршрут, вес, груз, телефон;
 *   generic (все остальные) — что хочет клиент и телефон.
 */
type Extracted = { complete: boolean; phone?: string; data: Record<string, string | undefined> };

async function extract(lines: Line[], company: AuthCompany): Promise<Extracted | null> {
  if (company.lead_kind === "cargo") {
    const f = await extractFields(lines);
    if (!f) return null;
    return {
      complete: isLeadComplete(f),
      phone: f.phone,
      data: { origin_city: f.origin_city, destination_city: f.destination_city, weight: f.weight, cargo_type: f.cargo_type },
    };
  }
  const conversation = lines.map((l) => `${l.who}: ${l.text}`).join("\n");
  const clientText = lines.filter((l) => l.who === "Клиент").map((l) => l.text).join("\n");
  const ai = await extractGenericLeadWithGemini(conversation, company.name);
  if (!ai) return null;
  const f = sanitizeGenericLead({ ...ai, phone: ai.phone ?? extractPhone(clientText) });
  return { complete: isGenericLeadComplete(f), phone: f.phone, data: { request: f.request } };
}

/**
 * Заявки диалога. В одном чате клиент может оставить несколько заявок, поэтому:
 *  - заявки ещё нет — анализируем историю, полный набор данных → новая заявка + уведомление;
 *  - заявка уже есть — анализируем ТОЛЬКО сообщения после неё (иначе регулярки
 *    цепляют старые данные со дна чата). Снова полный набор → НОВАЯ заявка +
 *    уведомление; только уточнения → дописываем пустые поля текущей заявки.
 * Заявка принадлежит компании Instagram-аккаунта, менеджер — из очереди этой компании.
 */
export async function maybeCreateOrUpdateLead(
  supabase: any,
  sessionId: string,
  clientName: string,
  history: { role: string; text: string }[],
  latestReply: string,
  company: AuthCompany | null,
  attempt = 1
) {
  if (!company) {
    console.warn(`[Lead Extraction] session ${sessionId.slice(0, 8)}: аккаунт не привязан к компании — заявка не создаётся`);
    return;
  }
  try {
    const { data: lastLeads, error: selectError } = await supabase
      .from("leads")
      .select("id, status, client_phone, collected_data, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (selectError) console.error("[Lead Extraction] Error selecting last lead:", selectError?.message);
    const lastLead = lastLeads?.[0] ?? null;

    // Переписка с метками «Клиент/Бот»: модель берёт факты только из слов клиента.
    let lines: Line[];
    if (lastLead) {
      const { data: fresh } = await supabase
        .from("messages")
        .select("sender, text")
        .eq("session_id", sessionId)
        .gt("created_at", lastLead.created_at)
        .order("created_at", { ascending: true });
      lines = ((fresh ?? []) as { sender: string; text: string }[]).map((m) => ({ who: speaker(m.sender), text: m.text }));
    } else {
      lines = history.map((h) => ({ who: speaker(h.role), text: h.text }));
    }
    if (lines[lines.length - 1]?.text !== latestReply) lines.push({ who: "Бот", text: latestReply });

    const fields = await extract(lines, company);
    if (!fields) {
      // Gemini не ответил, а бот клиенту уже ответил: заявку нельзя потерять, пробуем позже.
      if (attempt < LEAD_RETRY_ATTEMPTS) {
        console.warn(`[Lead Extraction] session ${sessionId.slice(0, 8)}: Gemini не ответил, попытка ${attempt}, повтор через минуту`);
        setTimeout(
          () => void maybeCreateOrUpdateLead(supabase, sessionId, clientName, history, latestReply, company, attempt + 1),
          LEAD_RETRY_DELAY_MS
        ).unref();
      } else {
        console.error(`[Lead Extraction] session ${sessionId.slice(0, 8)}: заявка не создана, Gemini не ответил за ${attempt} попыток`);
      }
      return;
    }
    console.log(`[Lead Extraction] session ${sessionId.slice(0, 8)}: ${lastLead ? "после последней заявки" : "новая"} →`, fields);

    if (fields.complete) {
      const manager = await assignNextManager(supabase, company.id);
      const { data: insertedLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          session_id: sessionId,
          company_id: company.id,
          client_name: clientName,
          client_phone: fields.phone ?? "",
          collected_data: fields.data,
          status: "new",
          manager_id: manager?.id ?? null,
        })
        .select("id, client_name, client_phone, collected_data")
        .single();

      if (insertError) {
        console.error("[Lead Extraction] Error creating lead:", insertError?.message);
        return;
      }
      console.log("[Lead Extraction] Lead created:", insertedLead.id);

      // Telegram-группа заявок есть только у компаний с подключённым ботом заявок (Radius).
      if (company.telegram_leads) await notifyNewLead(insertedLead.id);
      return;
    }

    // Неполный набор после существующей заявки — это уточнения к ней.
    if (lastLead && (lastLead.status === "new" || lastLead.status === "in_progress")) {
      const current = lastLead.collected_data ?? {};
      const patch: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields.data)) {
        if (!current[k] && v) patch[k] = v;
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
