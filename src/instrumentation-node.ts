import { startAllTelegramListeners } from "@/lib/telegram-listener";

// Во время `next build` сервер не стартует — слушатели не нужны.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  // Намеренно БЕЗ await: HTTP-сервер (и Render Health Check) не ждёт MTProto.
  // Подключение аккаунтов идёт параллельно и в фоне.
  startAllTelegramListeners()
    .then((r) => console.log(`[tg] listeners started: ${r.listening}/${r.total}`))
    .catch((e) => console.error("[tg] listeners bootstrap failed:", e?.message ?? e));
}
