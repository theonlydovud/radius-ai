import { screen } from "../lib/security";
import { createAdminClient } from "../lib/supabase/server";
import { invalidateAccountCache, legacyPromptDraft, loadAiPrompt } from "../lib/gemini";
import { ownsAccount } from "../lib/tenant";
import type { RouteContext } from "../index";

/**
 * «Роль ИИ» — один большой промпт Instagram-аккаунта вместо «Знаний» и «Правил общения»:
 *   GET /api/ai-role?bot_id=… → { prompt, draft }
 *       prompt — сохранённая роль; пусто — бот пока работает по старым правилам и знаниям,
 *       draft — черновик, собранный из них, чтобы при переходе ничего не потерять.
 *   PUT /api/ai-role { bot_id, prompt } — сохранить (пустая строка — вернуться к правилам и знаниям).
 * bot_id — аккаунт-источник знаний (если аккаунт подключён к «агенту», роль общая с ним).
 */
const MAX_PROMPT = 40_000;
const notFound = () => Response.json({ error: "Аккаунт не найден." }, { status: 404 });

export async function GET(req: Request, ctx: RouteContext) {
  const accountId = new URL(req.url).searchParams.get("bot_id");
  if (!accountId) return Response.json({ error: "bot_id обязателен." }, { status: 400 });
  if (!(await ownsAccount(ctx.auth!.company.id, accountId))) return notFound();
  const prompt = await loadAiPrompt(accountId);
  return Response.json({ data: { prompt, draft: prompt ? "" : await legacyPromptDraft(accountId), max: MAX_PROMPT } });
}

export async function PUT(req: Request, ctx: RouteContext) {
  const body = await req.json().catch(() => ({}));
  const accountId = String(body.bot_id ?? "");
  if (!accountId) return Response.json({ error: "bot_id обязателен." }, { status: 400 });
  if (!(await ownsAccount(ctx.auth!.company.id, accountId))) return notFound();
  const prompt = String(body.prompt ?? "").replace(/\r\n/g, "\n").trim();
  if (prompt.length > MAX_PROMPT) return Response.json({ error: `Слишком длинно: максимум ${MAX_PROMPT} символов.` }, { status: 400 });

  // Роль пишет сама компания: джейлбрейк или запрещённое здесь — серьёзный сигнал (владельцу платформы — сразу).
  if (prompt && !ctx.auth!.platform) await screen(prompt, { companyId: ctx.auth!.company.id, companyName: ctx.auth!.company.name, source: "role", accountId });
  const { error } = await createAdminClient().from("accounts").update({ ai_prompt: prompt || null }).eq("id", accountId);
  if (error) {
    const hint = /ai_prompt/.test(error.message) ? " Выполните migration-ai-role.sql в Supabase." : "";
    return Response.json({ error: error.message + hint }, { status: 500 });
  }
  invalidateAccountCache(accountId);
  return Response.json({ data: { prompt } });
}
