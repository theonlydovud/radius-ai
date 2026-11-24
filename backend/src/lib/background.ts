import { waitUntil } from "@vercel/functions";

/**
 * Работа после ответа на запрос. Meta и Telegram ждут 200 быстро, а ответ бота
 * готовится ещё 20+ секунд (пауза склейки, Gemini). На Vercel функцию после ответа
 * замораживают — waitUntil держит её живой, пока промис не завершится.
 * На обычном сервере (стенд, VPS) промис просто доживает сам.
 */
export function background(task: Promise<unknown>, tag = "bg") {
  const safe = task.catch((e: any) => console.error(`[${tag}] ошибка: ${e?.message ?? e}`));
  if (process.env.VERCEL) waitUntil(safe);
  return safe;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** На Vercel нет долгоживущего процесса: таймеры «через минуту» и setInterval там не работают. */
export const serverless = () => Boolean(process.env.VERCEL);
