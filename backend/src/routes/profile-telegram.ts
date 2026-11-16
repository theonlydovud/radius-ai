import { randomBytes } from "node:crypto";
import { createAdminClient } from "../lib/supabase/server";
import { invalidateAuthCache } from "../lib/auth";
import { dexaBotUsername } from "../lib/dexa-bot";
import type { RouteContext } from "../index";

/**
 * Личный Telegram сотрудника — туда приходят напоминания по его заявкам.
 *   POST   /api/profile/telegram → { url }   ссылка t.me/<бот DexaAI>?start=link_<код>; Start в боте привязывает аккаунт
 *   DELETE /api/profile/telegram             отвязать
 */
export async function POST(_req: Request, ctx: RouteContext) {
  const username = await dexaBotUsername().catch(() => null);
  if (!username) return Response.json({ error: "Бот DexaAI не настроен." }, { status: 503 });
  const nonce = randomBytes(15).toString("base64url");
  const { error } = await createAdminClient().from("telegram_links").insert({ nonce, user_id: ctx.auth!.id });
  if (error) {
    const hint = /telegram_links/.test(error.message) ? " Выполните migration-deals.sql в Supabase." : "";
    return Response.json({ error: error.message + hint }, { status: 500 });
  }
  return Response.json({ data: { url: `https://t.me/${username}?start=link_${nonce}` } });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { error } = await createAdminClient().from("app_users").update({ telegram_id: null }).eq("id", ctx.auth!.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAuthCache();
  return Response.json({ ok: true });
}
