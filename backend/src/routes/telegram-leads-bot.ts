import { timingSafeEqual } from "node:crypto";
import { getLeadNotifySettings, leadsBotSecret, resolveTarget } from "../lib/lead-notify";
import { handleLeadsBotUpdate } from "../lib/leads-bot";

/**
 * Вебхук бота заявок. Telegram присылает секрет в заголовке
 * X-Telegram-Bot-Api-Secret-Token — чужие запросы отклоняем.
 * Отвечаем сразу, обработка в фоне: иначе Telegram повторит запрос.
 */
export async function POST(req: Request) {
  const { token } = resolveTarget(await getLeadNotifySettings());
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(token ? leadsBotSecret(token) : "");
  if (!token || got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null);
  void handleLeadsBotUpdate(update).catch((e) => console.error("[leads-bot] ошибка:", e?.message ?? e));
  return Response.json({ ok: true });
}
