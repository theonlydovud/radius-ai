import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "@/lib/supabase/server";
import type { KnowledgeItem, SandboxChatMessage, SystemRule } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

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

/**
 * Собирает системный промпт целиком из базы данных: никакого хардкода
 * инструкций в коде. Тон, требования к квалификации лида и общие правила
 * подтягиваются из таблицы system_rules, а релевантные знания — из knowledge.
 */
export async function buildSystemInstruction(userMessage: string) {
  const supabase = createAdminClient();

  const { data: rules } = await supabase
    .from("system_rules")
    .select("id, rule_type, title, rule_text, is_active")
    .eq("is_active", true);

  const toneRules = (rules ?? []).filter(
    (r: SystemRule) => r.rule_type === "tone"
  );
  const qualificationRules = (rules ?? []).filter(
    (r: SystemRule) => r.rule_type === "qualification_requirements"
  );
  const generalRules = (rules ?? []).filter(
    (r: SystemRule) => r.rule_type === "general"
  );

  const knowledgeSnippets = await retrieveRelevantKnowledge(userMessage);

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
 * Простой RAG-поиск по pgvector. Если для запроса ещё не считан embedding,
 * функция откатывается к текстовому поиску ILIKE, чтобы песочница
 * продолжала работать даже без сервиса эмбеддингов.
 */
async function retrieveRelevantKnowledge(
  query: string,
  limit = 4
): Promise<KnowledgeItem[]> {
  const supabase = createAdminClient();

  try {
    const embedding = await embedText(query);
    if (embedding) {
      const { data, error } = await supabase.rpc("match_knowledge", {
        query_embedding: embedding,
        match_count: limit,
      });
      if (!error && data) return data as KnowledgeItem[];
    }
  } catch {
    // Падаем в текстовый поиск ниже.
  }

  const { data } = await supabase
    .from("knowledge")
    .select("id, title, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as KnowledgeItem[];
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

  for (const turn of history) {
    if (!turn?.text) continue;
    const role = turn.role === "model" ? "model" : "user";
    const last = normalized[normalized.length - 1];

    if (last && last.role === role) {
      last.text = `${last.text}\n${turn.text}`;
    } else {
      normalized.push({ role, text: turn.text });
    }
  }

  // История, передаваемая в startChat(), не должна заканчиваться на "user" —
  // этот ход добавит следующий вызов sendMessage(). Если оставить его здесь,
  // получится дубль текущего сообщения и разрыв чередования ролей, из-за
  // которого Gemini начинает "путать" контекст диалога.
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
