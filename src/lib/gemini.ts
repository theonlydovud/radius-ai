import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/lib/supabase/server";
import type { KnowledgeItem, SandboxChatMessage, SystemRule } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

// Модель можно переопределить на Render: GEMINI_MODEL=gemini-2.5-flash-lite
// (быстрее и дешевле; у 2.5-flash по умолчанию включён «thinking», это +секунды).
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Базовая системная инструкция. В отличие от system_rules (тон/
 * квалификация/общие правила, которые логист редактирует из UI), это
 * фундаментальная инструкция о личности и критических правилах контекста
 * и языка — она задаёт поведение, которое не должно зависеть от того,
 * заполнена ли база правил в БД.
 */
const BASE_SYSTEM_INSTRUCTION = `Ты — профессиональный AI-консультант логистической компании Radius Logistics.
Твоя главная цель — вежливо собрать 4 вводные для расчета стоимости доставки:
1. Город отправления (Откуда)
2. Город назначения (Куда)
3. Характеристики груза (Что за груз, вес или объем)
4. Номер телефона клиента для связи

КРИТИЧЕСКИЕ ПРАВИЛА КОНТЕКСТА И ЯЗЫКА:
- ВСЕГДА анализируй всю историю переписки. Помни всё, что клиент уже сообщил ранее. Никогда не запрашивай повторно данные, которые уже были озвучены.
- Клиент может писать на русском, узбекском (латиница/кириллица) или смешанном языке.
- Понимай узбекские падежные окончания:
  * Окончание "-дан" / "-dan" означает «ИЗ» (точка отправления). Пример: "мумбайдан" = из Мумбаи.
  * Окончание "-га" / "-ga" / "-ка" / "-ka" означает «В» (точка назначения). Пример: "тошкенга" = в Ташкент.
- Если клиент сначала написал "мумбайдан", а затем "тошкенга", ты должен четко зафиксировать маршрут: "Из Мумбаи в Ташкент". Не придумывай другие страны (например, Россию), если о них не просили.
- Веди диалог поэтапно, коротко и дружелюбно. Когда все 4 пункта собраны — поблагодари и сообщи, что логист свяжется для точного расчета.
- Ты — консультант, а не менеджер по продажам: точную цену клиенту самостоятельно не называешь, только собираешь данные для расчёта логистом.`;

// ---------------------------------------------------------------------
// Кэш правил/знаний по аккаунту (TTL 30 с). Лежит в globalThis, чтобы
// сбрасываться из route handlers (см. invalidateAccountCache).
// ---------------------------------------------------------------------
type CacheEntry<T> = { at: number; value: T };
const cg = globalThis as unknown as { __radiusAiCache?: Map<string, CacheEntry<any>> };
const cache = (cg.__radiusAiCache ??= new Map());
const CACHE_TTL_MS = 30_000;
const SMALL_KB_LIMIT = 12; // до стольки статей кладём в промпт целиком, без эмбеддингов

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateAccountCache(accountId?: string | null) {
  if (!accountId) return cache.clear();
  cache.delete(`rules:${accountId}`);
  cache.delete(`kb:${accountId}`);
}

async function loadRules(accountId?: string | null): Promise<SystemRule[]> {
  const run = async () => {
    const supabase = createAdminClient();
    let q = supabase
      .from("system_rules")
      .select("id, rule_type, title, rule_text, is_active")
      .eq("is_active", true);
    if (accountId) q = q.eq("account_id", accountId);
    const { data } = await q;
    return (data ?? []) as SystemRule[];
  };
  return accountId ? cached(`rules:${accountId}`, run) : run();
}

async function loadKnowledge(accountId?: string | null): Promise<KnowledgeItem[]> {
  const run = async () => {
    const supabase = createAdminClient();
    let q = supabase
      .from("knowledge")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (accountId) q = q.eq("account_id", accountId);
    const { data } = await q;
    return (data ?? []) as KnowledgeItem[];
  };
  return accountId ? cached(`kb:${accountId}`, run) : run();
}

/**
 * Собирает системный промпт целиком из базы данных: никакого хардкода
 * инструкций в коде. Тон, требования к квалификации лида и общие правила
 * подтягиваются из system_rules, релевантные знания — из knowledge.
 * Если передан accountId — берутся ТОЛЬКО правила и знания этого аккаунта.
 */
export async function buildSystemInstruction(userMessage: string, accountId?: string | null) {
  const [rules, knowledgeSnippets] = await Promise.all([
    loadRules(accountId),
    retrieveRelevantKnowledge(userMessage, accountId),
  ]);

  const toneRules = rules.filter((r) => r.rule_type === "tone");
  const qualificationRules = rules.filter((r) => r.rule_type === "qualification_requirements");
  const generalRules = rules.filter((r) => r.rule_type === "general");

  const sections: string[] = [];

  sections.push(BASE_SYSTEM_INSTRUCTION);

  if (toneRules.length) {
    sections.push(
      "## Тон общения\n" +
        toneRules.map((r: SystemRule) => `- ${r.title}: ${r.rule_text}`).join("\n")
    );
  }

  if (qualificationRules.length) {
    sections.push(
      "## Требования к квалификации лида\n" +
        qualificationRules
          .map((r: SystemRule) => `- ${r.title}: ${r.rule_text}`)
          .join("\n")
    );
  }

  if (generalRules.length) {
    sections.push(
      "## Общие правила\n" +
        generalRules.map((r: SystemRule) => `- ${r.title}: ${r.rule_text}`).join("\n")
    );
  }

  if (knowledgeSnippets.length) {
    sections.push(
      "## База знаний (используй как основной источник фактов)\n" +
        knowledgeSnippets
          .map((k) => `### ${k.title}\n${k.content}`)
          .join("\n\n")
    );
  }

  return sections.join("\n\n");
}

/**
 * RAG по знаниям аккаунта.
 *  - Небольшая база (<= SMALL_KB_LIMIT статей): кладём всё в промпт. Это быстрее
 *    (нет вызова embedding + RPC на каждое сообщение) и надёжнее: в проекте
 *    эмбеддинги статей нигде не считаются, и прежний код при пустом ответе RPC
 *    возвращал [] — т.е. модель вообще не видела базу знаний.
 *  - Большая база: pgvector с фильтром по аккаунту; если пусто/ошибка — свежие статьи.
 */
async function retrieveRelevantKnowledge(
  query: string,
  accountId?: string | null,
  limit = 4
): Promise<KnowledgeItem[]> {
  const all = await loadKnowledge(accountId);
  if (all.length <= SMALL_KB_LIMIT) return all;

  try {
    const embedding = await embedText(query);
    if (embedding) {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("match_knowledge", {
        query_embedding: embedding,
        match_count: limit,
        filter_account_id: accountId ?? null,
      });
      if (!error && Array.isArray(data) && data.length) return data as KnowledgeItem[];
    }
  } catch {
    // падаем в фолбэк ниже
  }

  return all.slice(0, limit);
}

async function embedText(text: string): Promise<number[] | null> {
  try {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch {
    return null;
  }
}

/**
 * Приводит историю к формату, который требует Gemini SDK: роли строго
 * "user" | "model", строгое чередование ходов, без завершающего "user"
 * (следующий пользовательский ход и так передаётся отдельным аргументом
 * в sendMessage()). Если по какой-то причине в историю попали два подряд
 * сообщения одной роли (например, дублирование на стороне вызывающего
 * кода), они склеиваются в один ход, а не создают невалидную структуру,
 * из-за которой модель теряет контекст предыдущих сообщений.
 */
function normalizeHistory(history: SandboxChatMessage[]): SandboxChatMessage[] {
  const normalized: SandboxChatMessage[] = [];

  // Если история содержит служебные/системные сообщения, они не должны
  // передаваться в `history` — systemInstruction уже отправляется отдельно.
  // Кроме того, Gemini ожидает, что история не будет начинаться с ответа
  // модели: ведущие `model`-ходы безопаснее игнорировать.
  let seenUser = false;

  for (const turn of history) {
    if (!turn?.text) continue;

    // Нормализуем возможные варианты ролей: допускаем 'model', 'assistant', 'ai' и 'user'.
    const raw = (turn.role || "").toString().toLowerCase();
    if (raw === "system") {
      // Пропускаем системные сообщения: они передаются отдельно в systemInstruction
      continue;
    }

    const role = raw === "model" || raw === "assistant" || raw === "ai" ? "model" : "user";

    // Игнорируем ведущие ответы модели до первого пользовательского хода.
    if (!seenUser && role === "model") continue;

    if (role === "user") seenUser = true;

    const last = normalized[normalized.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text}\n${turn.text}`;
    } else {
      normalized.push({ role, text: turn.text });
    }
  }

  // История, передаваемая в startChat(), не должна заканчиваться на "user" —
  // этот ход будет передан как отдельный аргумент в sendMessage().
  if (normalized.length && normalized[normalized.length - 1].role === "user") {
    normalized.pop();
  }

  return normalized;
}

export class GeminiRateLimitError extends Error {
  constructor() {
    super("RATE_LIMIT");
    this.name = "GeminiRateLimitError";
  }
}

/**
 * Отправляет сообщение в Gemini 2.5 Flash-Lite с историей диалога и
 * системным промптом, собранным из БД. Пробрасывает GeminiRateLimitError
 * при 429, которую вызывающая сторона (route.ts) превращает в понятное
 * сообщение для пользователя.
 */
export async function sendToGemini(
  systemInstruction: string,
  history: SandboxChatMessage[],
  message: string
) {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
  });

  try {
    const chat = model.startChat({
      history: normalizeHistory(history).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 600,
      },
    });

    const result = await chat.sendMessage(message);
    return result.response.text();
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    const message: string = err?.message ?? "";
    if (status === 429 || message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
      throw new GeminiRateLimitError();
    }
    throw err;
  }
}

/**
 * Извлекает структурированные поля заявки (город отправления, назначения, вес, тип груза, телефон)
 * из диалога с помощью Gemini. Работает лучше чем регулярные выражения для многоязычного контента.
 */
export async function extractLeadFieldsWithGemini(conversation: string) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const extractionPrompt = `Ты — ассистент логистической компании. Твоя задача — извлечь из диалога клиента структурированные данные заявки.

Диалог:
${conversation}

Извлеки и верни ТОЛЬКО JSON (без булков, без префикса, только валидный JSON) со следующей структурой:
{
  "origin_city": "город отправления или null",
  "destination_city": "город назначения или null", 
  "weight": "вес с единицей (например '4 т', '100 кг') или null",
  "cargo_type": "тип груза или null",
  "phone": "номер телефона или null"
}

ПРАВИЛА:
- Жди узбекские падежи: "-дан"/"-dan" = ИЗ, "-га"/"-ga"/"-ка"/"-ka" = В
- Не выдумывай страны, если их явно не указали
- Phone: ищи последовательность цифр длины 10+ с возможными +, пробелами, тире, скобками
- Верни только JSON, никаких комментариев или пояснений`;

  try {
    const result = await model.generateContent(extractionPrompt);
    const jsonText = result.response.text().trim();
    const parsed = JSON.parse(jsonText);
    
    // Нормализуем результат
    return {
      origin_city: parsed.origin_city || undefined,
      destination_city: parsed.destination_city || undefined,
      weight: parsed.weight || undefined,
      cargo_type: parsed.cargo_type || undefined,
      phone: parsed.phone || undefined,
    };
  } catch (err: any) {
    console.error("[Gemini Lead Extraction] Error:", err?.message);
    // Fallback на пустой результат если что-то пошло не так
    return {
      origin_city: undefined,
      destination_city: undefined,
      weight: undefined,
      cargo_type: undefined,
      phone: undefined,
    };
  }
}
