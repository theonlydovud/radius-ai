import { instagramAuthUrl, signState } from "../lib/instagram";
import { frontendUrl } from "../lib/urls";

/**
 * Старт входа через Instagram. Дашборд открывает
 * /api/auth/instagram?knowledge_source_id=<агент> — выбранный агент едет в подписанном state.
 */
export async function GET(req: Request) {
  if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET) {
    return Response.redirect(frontendUrl("/accounts?ig_error=" + encodeURIComponent("На backend не заданы INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET.")));
  }
  const sourceId = new URL(req.url).searchParams.get("knowledge_source_id") || null;
  return Response.redirect(instagramAuthUrl(signState({ s: sourceId })));
}
