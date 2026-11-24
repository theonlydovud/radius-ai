import { timingSafeEqual } from "node:crypto";
import { runReminders } from "../lib/reminders";
import { recoverMissedReplies } from "../lib/reply-recovery";
import { refreshInstagramTokens } from "../lib/instagram";
import { ensureLeadsBotWebhook } from "../lib/lead-notify";
import { ensureDexaBotWebhook } from "../lib/dexa-bot";

/**
 * POST /api/cron/tick — раз в минуту. На Vercel нет постоянного процесса, поэтому всё,
 * что раньше делали таймеры сервера, запускает планировщик Supabase (pg_cron + pg_net,
 * migration-serverless.sql) с заголовком x-cron-key = CRON_SECRET:
 *   - напоминания по заявкам (контроль сроков);
 *   - ответы клиентам, оставшимся без ответа;
 *   - раз в час — вебхуки ботов Telegram смотрят на нас;
 *   - раз в сутки — продление токенов Instagram (живут 60 дней).
 * Повторный или одновременный тик безопасен: напоминания и ответы защищены отметками в базе.
 */
function authorized(req: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("x-cron-key") ?? new URL(req.url).searchParams.get("key") ?? "";
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function step(name: string, task: () => Promise<unknown>) {
  const started = Date.now();
  try {
    const result = await task();
    return { name, ok: true, ms: Date.now() - started, result: result ?? null };
  } catch (e: any) {
    console.error(`[tick] ${name}: ${e?.message ?? e}`);
    return { name, ok: false, ms: Date.now() - started, error: String(e?.message ?? e) };
  }
}

async function tick(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force");
  const tasks: Promise<unknown>[] = [step("reminders", () => runReminders(now)), step("recovery", () => recoverMissedReplies())];
  if (now.getUTCMinutes() === 5 || force === "webhooks") {
    tasks.push(step("webhooks", () => Promise.all([ensureLeadsBotWebhook(), ensureDexaBotWebhook()])));
  }
  if ((now.getUTCHours() === 2 && now.getUTCMinutes() === 0) || force === "instagram") {
    tasks.push(step("instagram-tokens", () => refreshInstagramTokens()));
  }
  return Response.json({ ok: true, at: now.toISOString(), steps: await Promise.all(tasks) });
}

export const POST = tick;
export const GET = tick;
