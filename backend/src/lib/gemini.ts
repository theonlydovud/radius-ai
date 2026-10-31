import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { createAdminClient } from "./supabase/server";
import type { KnowledgeItem, SandboxChatMessage, SystemRule } from "../types";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

// Модель можно переопределить на Render: GEMINI_MODEL=gemini-2.5-flash-lite
// (быстрее и дешевле; у 2.5-flash по умолчанию включён «thinking», это +секунды).
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Без таймаута зависший запрос навсегда блокировал очередь этого чата.
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RATE_LIMIT_WAIT_MS = 30_000;

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

/**
 * Аккаунт может быть подключён к «агенту» (accounts.knowledge_source_id) —
 * тогда знания и правила берутся у агента. Колонки ещё нет (миграция не
 * применена) — работаем по-старому, со своими знаниями аккаунта.
 */
async function resolveKnowledgeOwner(accountId?: string | null) {
  if (!accountId) return accountId;
  return cached(`owner:${accountId}`, async () => {
    const { data, error } = await createAdminClient()
      .from("accounts")
      .select("knowledge_source_id")
      .eq("id", accountId)
      .maybeSingle();
    if (error) return accountId;
    return (data?.knowledge_source_id as string | null) ?? accountId;
  });
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
 * Если передан accountId — берутся ТОЛЬКО правила и знания этого аккаунта
 * (или его агента, если аккаунт к нему подключён).
 */
export async function buildSystemInstruction(userMessage: string, sourceAccountId?: string | null) {
  const accountId = await resolveKnowledgeOwner(sourceAccountId);
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
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" }, { timeout: 10_000 });
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
/**
 * Повторяет запрос при временных сбоях: перегрузка (503), сеть, таймаут, битый JSON.
 * На лимит запросов (429) Google пишет, сколько подождать: ждём столько, но не дольше 30 с.
 * Постоянные ошибки (неверный ключ, модель) не повторяем.
 */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const text: string = err?.message ?? "";
      const rateLimited = status === 429 || text.includes("429") || text.includes("RESOURCE_EXHAUSTED");
      if (!rateLimited && typeof status === "number" && status >= 400 && status < 500) throw err;
      if (attempt >= MAX_ATTEMPTS) throw rateLimited ? new GeminiRateLimitError() : err;

      const suggestedSec = Number(text.match(/retry in ([\d.]+)s/i)?.[1]);
      const waitMs = rateLimited ? Math.min(((suggestedSec || 20) + 1) * 1000, MAX_RATE_LIMIT_WAIT_MS) : attempt * 1500;
      console.warn(`[gemini] попытка ${attempt} не удалась (${status ?? text.slice(0, 120)}), повтор через ${Math.round(waitMs / 1000)} с`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export async function sendToGemini(
  systemInstruction: string,
  history: SandboxChatMessage[],
  message: string
) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction }, { timeout: REQUEST_TIMEOUT_MS });
  const chatHistory = normalizeHistory(history).map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  return withRetry(async () => {
    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 600,
      },
    });

    const result = await chat.sendMessage(message);
    return result.response.text();
  });
}

const nullableText = { type: SchemaType.STRING, nullable: true } as const;
const LEAD_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    is_cargo_request: { type: SchemaType.BOOLEAN },
    origin_city: nullableText,
    destination_city: nullableText,
    weight: nullableText,
    cargo_type: nullableText,
    phone: nullableText,
  },
  required: ["is_cargo_request", "origin_city", "destination_city", "weight", "cargo_type", "phone"],
};

/**
 * Извлекает поля заявки из переписки. conversation — строки вида
 * «Клиент: …» / «Бот: …»: факты берутся только из слов клиента.
 * Результат дополнительно проверяется в sanitizeLeadFields (lead-extraction.ts).
 * null — модель не ответила: вызывающий код сам решает, когда попробовать снова.
 */
export async function extractLeadFieldsWithGemini(conversation: string): Promise<Record<string, unknown> | null> {
  const model = genAI.getGenerativeModel(
    {
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json", responseSchema: LEAD_SCHEMA, temperature: 0 },
    },
    { timeout: REQUEST_TIMEOUT_MS }
  );

  const extractionPrompt = `Ты извлекаешь данные заявки на грузоперевозку из переписки клиента с ботом логистической компании Radius Logistics.
Строки «Клиент:» — сообщения клиента, «Бот:» — ответы бота, «Менеджер:» — ответы сотрудника.
Факты бери из сообщений клиента. Исключение: если бот подытожил данные (например «Xitoydan Toshkentga unitaz, 30 t…»),
а клиент после этого не возразил и не поправил — такие данные считаются подтверждёнными клиентом.

Переписка:
${conversation}

Верни JSON строго такого вида:
{
  "is_cargo_request": true или false,
  "origin_city": "..." или null,
  "destination_city": "..." или null,
  "weight": "..." или null,
  "cargo_type": "..." или null,
  "phone": "..." или null
}

ПРАВИЛА:
- is_cargo_request = true, только если клиент действительно хочет перевезти груз. Приветствие, шутка, вопрос не по теме, спам — false.
- origin_city и destination_city — ТОЛЬКО реальные географические названия (город, область или страна), по-русски в именительном падеже: «Ташкент», «Шэньчжэнь», «Китай», «Москва».
  Предмет, товар, имя или непонятное слово — это НЕ город, ставь null. Пример: «unitazga» значит «для унитаза/на унитаз», а не город.
- Узбекские окончания: «-dan/-дан» = откуда, «-ga/-га/-ka/-ка/-qa/-қа» = куда. «Xitoydan Toshkentga» → «Китай» → «Ташкент».
- weight — вес или объём с единицами, как сказал клиент: «15 т», «300 кг», «1 контейнер 40 футов», «20 м³». Без числа — null.
- cargo_type — что конкретно везут: «мебель», «унитазы», «одежда», «запчасти в 40-футовом контейнере».
  Общие слова без конкретики («yuk», «груз», «товар», «mahsulot», «cargo») — null.
- phone — номер телефона клиента, как он его написал (цифры, можно с +). Нет номера — null.
- Ничего не придумывай и не угадывай. Если клиент не сказал явно — null.`;

  try {
    // Строгая схема: в обычном JSON-режиме модель заметно часто возвращала битый JSON.
    return await withRetry(async () => {
      const result = await model.generateContent(extractionPrompt);
      const raw = result.response.text();
      return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    });
  } catch (err: any) {
    console.error("[Gemini Lead Extraction] Error:", err?.message);
    return null;
  }
}
