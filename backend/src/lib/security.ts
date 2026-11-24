import { createAdminClient } from "./supabase/server";
import { platformAdminIds } from "./platform";
import { sendToEmployee } from "./dexa-bot";
import { escapeHtml } from "./lead-notify";
import { frontendUrl } from "./urls";

/**
 * Безопасность платформы: что заметила система — в журнал security_events (migration-platform-admin.sql),
 * серьёзное — сразу владельцу платформы в Telegram. Решение (заморозить, забанить) принимает человек.
 *
 *   jailbreak — попытка заставить бота забыть инструкции, раскрыть промпт, «режим разработчика»…
 *   illegal   — наркотики, оружие, взрывчатка, подделка документов, отмывание, кардинг…
 * Источник важен: клиент в Instagram, который пробует сломать бота, — не вина компании;
 * та же фраза в «Роли ИИ» или в «Диалоге с ИИ» — это уже сама компания.
 */

export type SecuritySource = "client" | "role" | "playground" | "assistant" | "gemini" | "traffic";
export type SecurityKind = "jailbreak" | "illegal" | "blocked_by_ai" | "spike";
export type Severity = "low" | "medium" | "high";

const JAILBREAK: RegExp[] = [
  /ignore (all |the )?(previous|prior|above) (instructions|rules|prompts?)/i,
  /disregard (your|the|all) (instructions|rules|guidelines)/i,
  /\b(you are|you're) now (dan|an? unrestricted|free from)/i,
  /\bdeveloper mode\b/i,
  /\bjail ?break/i,
  /\b(reveal|show|print|repeat) (me )?(your|the) (system )?(prompt|instructions)/i,
  /\bdo anything now\b/i,
  /(забудь|игнорируй|проигнорируй|отбрось)\s+(все\s+)?(свои\s+|предыдущие\s+|прошлые\s+)?(инструкции|правила|ограничения|установки)/i,
  /(покажи|выведи|напиши|раскрой)\s+(мне\s+)?(свой\s+|свои\s+)?(системн\S*\s+)?(промпт|инструкци\S*)/i,
  /режим\s+разработчика/i,
  /(ты\s+теперь|теперь\s+ты)\s+(не\s+бот|без\s+ограничений|свободн)/i,
  /без\s+(каких-либо\s+)?(ограничений|цензуры|фильтров)/i,
  /(oldingi|barcha)\s+(ko['‘’ʻ]?rsatmalar|qoidalar)\S*\s+(unut|e['‘’ʻ]?tiborsiz)/i,
  /(ko['‘’ʻ]?rsatmalar|qoidalar)\S*\s*ni\s+unut/i,
  /tizim\s+(prompt|ko['‘’ʻ]?rsatma)\S*\s*ni\s+(ko['‘’ʻ]?rsat|yoz)/i,
];

const ILLEGAL: RegExp[] = [
  /(наркот\S*|закладк\S*|мефедрон\S*|героин\S*|кокаин\S*|гашиш\S*|амфетамин\S*|экстази|\blsd\b)/i,
  /\b(drugs? for sale|buy (cocaine|heroin|meth|mdma)|cocaine|heroin|methamphetamine)\b/i,
  /(giyohvand|narkotik)\S*/i,
  /(купить|продать|продам|достать)\s+(\S+\s+)?(пистолет|автомат|оружие|патрон|гранат)/i,
  /(взрывчатк\S*|самодельн\S*\s+бомб\S*|изготов\S*\s+бомб\S*|how to make a bomb|\bexplosives?\b)/i,
  /(поддельн|фальшив)\S*\s+(паспорт|документ|диплом|права|купюр|деньг)/i,
  /\b(fake (passport|id|documents?)|counterfeit (money|bills))\b/i,
  /(отмыв\S*\s+(денег|средств)|money laundering|обналич\S*|кардинг\S*|\bcarding\b|дроп\S*\s+карт\S*)/i,
  /(детск\S*\s+порн\S*|child porn\S*|\bcp links?\b)/i,
];

/** Что нашлось в тексте: самое серьёзное совпадение или null. */
export function scanText(text: string): { kind: "jailbreak" | "illegal"; matched: string } | null {
  if (!text) return null;
  for (const re of ILLEGAL) {
    const m = text.match(re);
    if (m) return { kind: "illegal", matched: m[0].slice(0, 80) };
  }
  for (const re of JAILBREAK) {
    const m = text.match(re);
    if (m) return { kind: "jailbreak", matched: m[0].slice(0, 80) };
  }
  return null;
}

/** Насколько серьёзно: запрещённое — всегда; джейлбрейк от самой компании — серьёзнее, чем от клиента. */
function severityOf(source: SecuritySource, kind: SecurityKind): Severity {
  if (kind === "illegal") return "high";
  if (kind === "jailbreak") return source === "client" ? "medium" : "high";
  if (kind === "spike") return "medium";
  return "low";
}

const SOURCE_LABEL: Record<SecuritySource, string> = {
  client: "клиент в Instagram",
  role: "«Роль ИИ» компании",
  playground: "«Диалог с ИИ» компании",
  assistant: "ИИ-ассистент компании",
  gemini: "ответ бота",
  traffic: "трафик",
};
const KIND_LABEL: Record<SecurityKind, string> = {
  jailbreak: "Попытка взломать бота (джейлбрейк)",
  illegal: "Запрещённая тема",
  blocked_by_ai: "Gemini заблокировал ответ как опасный",
  spike: "Всплеск трафика",
};

/** Не чаще раза в 30 минут на одну компанию и вид события. */
const NOTIFY_GAP_MS = 30 * 60_000;

/**
 * Записать событие. Ошибка журнала никогда не ломает основную работу (ответ клиенту, сохранение роли).
 * notify — сообщить владельцу платформы сразу (high — всегда, кроме повторов в течение 30 минут).
 */
export async function recordSecurityEvent(e: {
  companyId: string | null | undefined;
  source: SecuritySource;
  kind: SecurityKind;
  excerpt?: string;
  matched?: string;
  accountId?: string | null;
  sessionId?: string | null;
  companyName?: string;
}) {
  try {
    const supabase = createAdminClient();
    const severity = severityOf(e.source, e.kind);
    let notify = severity === "high" || e.kind === "spike";
    if (notify && e.companyId) {
      const since = new Date(Date.now() - NOTIFY_GAP_MS).toISOString();
      const { data: recent } = await supabase
        .from("security_events")
        .select("id")
        .eq("company_id", e.companyId)
        .eq("kind", e.kind)
        .eq("notified", true)
        .gte("created_at", since)
        .limit(1);
      if (recent?.length) notify = false;
    }
    const { error } = await supabase.from("security_events").insert({
      company_id: e.companyId ?? null,
      account_id: e.accountId ?? null,
      session_id: e.sessionId ?? null,
      source: e.source,
      kind: e.kind,
      severity,
      excerpt: e.excerpt?.slice(0, 1000) ?? null,
      matched: e.matched ?? null,
      notified: notify,
    });
    if (error) {
      if (!/security_events/.test(error.message)) console.warn(`[security] журнал: ${error.message}`);
      return; // до миграции таблицы нет — молча
    }
    console.warn(`[security] ${e.kind} (${e.source}) ${e.companyName ?? e.companyId ?? ""}: ${e.matched ?? ""}`);
    if (notify) await notifyPlatform(e, severity);
  } catch (err: any) {
    console.warn(`[security] ${err?.message ?? err}`);
  }
}

async function notifyPlatform(e: Parameters<typeof recordSecurityEvent>[0], severity: Severity) {
  let name = e.companyName;
  if (!name && e.companyId) {
    const { data } = await createAdminClient().from("companies").select("name").eq("id", e.companyId).maybeSingle();
    name = data?.name;
  }
  const html = [
    `${severity === "high" ? "🚨" : "⚠️"} <b>${escapeHtml(KIND_LABEL[e.kind])}</b>`,
    `Компания: <b>${escapeHtml(name ?? "—")}</b>`,
    `Откуда: ${escapeHtml(SOURCE_LABEL[e.source])}`,
    e.matched ? `Совпало: «${escapeHtml(e.matched)}»` : "",
    e.excerpt ? `\n<i>${escapeHtml(e.excerpt.slice(0, 300))}</i>` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const button = { text: "Открыть в панели", url: frontendUrl("/platform?tab=security") };
  for (const id of await platformAdminIds()) await sendToEmployee(id, html, button);
}

/** Проверить текст и, если нашлось, записать событие. Возвращает находку (или null). */
export async function screen(
  text: string,
  ctx: { companyId: string | null | undefined; source: SecuritySource; accountId?: string | null; sessionId?: string | null; companyName?: string }
) {
  const hit = scanText(text);
  if (hit) await recordSecurityEvent({ ...ctx, kind: hit.kind, matched: hit.matched, excerpt: text });
  return hit;
}

/** Всплески трафика: сообщения клиентов за последний час по компаниям (раз в час из тика). */
const SPIKE_PER_HOUR = Number(process.env.SECURITY_SPIKE_PER_HOUR || 400);

export async function checkTrafficSpikes() {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data: msgs } = await supabase.from("messages").select("session_id").eq("sender", "user").gte("created_at", since).limit(20_000);
  if (!msgs?.length) return 0;
  const bySession = new Map<string, number>();
  for (const m of msgs as { session_id: string }[]) bySession.set(m.session_id, (bySession.get(m.session_id) ?? 0) + 1);
  const { data: sessions } = await supabase.from("chat_sessions").select("id, accounts(company_id)").in("id", [...bySession.keys()].slice(0, 1000));
  const byCompany = new Map<string, number>();
  for (const s of (sessions ?? []) as any[]) {
    const company = s.accounts?.company_id;
    if (company) byCompany.set(company, (byCompany.get(company) ?? 0) + (bySession.get(s.id) ?? 0));
  }
  let flagged = 0;
  for (const [companyId, count] of byCompany) {
    if (count < SPIKE_PER_HOUR) continue;
    flagged++;
    await recordSecurityEvent({ companyId, source: "traffic", kind: "spike", matched: `${count} сообщений клиентов за час`, excerpt: `Порог: ${SPIKE_PER_HOUR} в час` });
  }
  return flagged;
}
