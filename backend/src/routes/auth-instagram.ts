import { instagramAuthUrl, signState } from "../lib/instagram";
import { frontendUrl } from "../lib/urls";
import type { RouteContext } from "../index";

/**
 * Старт входа через Instagram. Дашборд открывает
 * /api/auth/instagram?knowledge_source_id=<агент> — выбранный агент и компания едут в подписанном state.
 */
export async function GET(req: Request, ctx: RouteContext) {
  if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET) {
    return Response.redirect(frontendUrl("/accounts?ig_error=" + encodeURIComponent("На backend не заданы INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET.")));
  }
  const sourceId = new URL(req.url).searchParams.get("knowledge_source_id") || null;
  return Response.redirect(instagramAuthUrl(signState({ s: sourceId, c: ctx.auth!.company.id })));
}
