/**
 * Склейка нескольких сообщений подряд. Клиенты часто пишут так:
 *   «Assalomu aleykum» / «yukim bor edi» / «obkelasizmi?»
 * Раньше бот отвечал на каждое отдельно. Теперь каждое сообщение сразу
 * сохраняется в БД, а ответ откладывается до паузы в переписке: бот отвечает
 * один раз на всё, что клиент написал после его последнего ответа.
 *
 * REPLY_DEBOUNCE_MS — сколько ждать тишины (по умолчанию 7 с);
 * REPLY_MAX_WAIT_MS — дольше этого не ждём, даже если клиент пишет без остановки.
 */

const QUIET_MS = Number(process.env.REPLY_DEBOUNCE_MS || 7000);
const MAX_WAIT_MS = Number(process.env.REPLY_MAX_WAIT_MS || 25000);

type Burst = { timer: NodeJS.Timeout; startedAt: number };
const g = globalThis as unknown as { __radiusBursts?: Map<string, Burst> };
const bursts = (g.__radiusBursts ??= new Map());

/** Ставит ответ на конец паузы; каждое новое сообщение переносит его. flush — один раз на серию. */
export function scheduleReply(key: string, flush: () => void) {
  const now = Date.now();
  const existing = bursts.get(key);
  if (existing) clearTimeout(existing.timer);
  const startedAt = existing?.startedAt ?? now;
  const delay = Math.max(0, Math.min(QUIET_MS, startedAt + MAX_WAIT_MS - now));
  const timer = setTimeout(() => {
    bursts.delete(key);
    flush();
  }, delay);
  bursts.set(key, { timer, startedAt });
}

/**
 * Делит историю на «до» и «ожидающие ответа»: все сообщения клиента после
 * последнего ответа бота/менеджера склеиваются в один текст.
 */
export function splitPending<T extends { role: string; text: string }>(turns: T[]) {
  let i = turns.length;
  while (i > 0 && turns[i - 1].role === "user") i--;
  return {
    before: turns.slice(0, i),
    pending: turns
      .slice(i)
      .map((t) => t.text)
      .join("\n"),
  };
}
