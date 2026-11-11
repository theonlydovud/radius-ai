import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "../lib/gemini";
import { createAdminClient } from "../lib/supabase/server";
import type { SandboxChatMessage } from "../types";

// Задержка перед ответом ИИ, чтобы поведение в песочнице совпадало с
// продакшн-ботом (там задержка имитирует "живой" набор текста).
const MIN_DELAY_MS = 2500;
const MAX_DELAY_MS = 3000;

function randomDelay() {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message: string = body.message;
    const history: SandboxChatMessage[] = body.history ?? [];
    let accountId: string | null = body.account_id ?? null;
    // Без аккаунта правила и знания всех аккаунтов смешались бы в одну инструкцию — берём первый.
    if (!accountId) {
      const { data } = await createAdminClient().from("accounts").select("id").eq("platform", "instagram").order("created_at").limit(1);
      accountId = data?.[0]?.id ?? null;
    }

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "Поле message обязательно." },
        { status: 400 }
      );
    }

    // Системные инструкции целиком собираются из БД (system_rules + knowledge).
    const systemInstruction = await buildSystemInstruction(message, accountId);

    const [replyText] = await Promise.all([
      sendToGemini(systemInstruction, history, message),
      randomDelay(),
    ]);

    return Response.json({ reply: replyText });
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      // Защита от ошибки 429: не роняем систему, отдаём понятное сообщение.
      return Response.json(
        {
          reply:
            "Слишком большая нагрузка на сервера, повторите попытку через 1-2 минуты.",
          rateLimited: true,
        },
        { status: 200 }
      );
    }

    console.error("[api/chat] error:", err);
    return Response.json(
      { error: "Внутренняя ошибка сервера. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
