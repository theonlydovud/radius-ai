import { NextRequest, NextResponse } from "next/server";
import { buildSystemInstruction, GeminiRateLimitError, sendToGemini } from "@/lib/gemini";
import type { SandboxChatMessage } from "@/types";

// Без этого Next.js выполняет GET один раз при `next build` и отдаёт замороженный результат.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Задержка перед ответом ИИ, чтобы поведение в песочнице совпадало с
// продакшн-ботом (там задержка имитирует "живой" набор текста).
const MIN_DELAY_MS = 2500;
const MAX_DELAY_MS = 3000;

function randomDelay() {
  const ms = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message: string = body.message;
    const history: SandboxChatMessage[] = body.history ?? [];
    const accountId: string | null = body.account_id ?? null;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
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

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      // Защита от ошибки 429: не роняем систему, отдаём понятное сообщение.
      return NextResponse.json(
        {
          reply:
            "Слишком большая нагрузка на сервера, повторите попытку через 1-2 минуты.",
          rateLimited: true,
        },
        { status: 200 }
      );
    }

    console.error("[api/chat] error:", err);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
