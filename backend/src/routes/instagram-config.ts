import { instagramRedirectUri } from "../lib/instagram";
import { backendUrl, frontendUrl } from "../lib/urls";

/**
 * Состояние настройки Instagram для окна подключения в дашборде:
 * какие переменные заданы на backend (только да/нет, без значений) и какие
 * адреса вписать в Meta for Developers.
 */
export async function GET() {
  const env = {
    INSTAGRAM_APP_ID: !!process.env.INSTAGRAM_APP_ID,
    INSTAGRAM_APP_SECRET: !!process.env.INSTAGRAM_APP_SECRET,
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: !!process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    FACEBOOK_APP_SECRET: !!process.env.FACEBOOK_APP_SECRET,
    FRONTEND_URL: !!process.env.FRONTEND_URL,
  };
  return Response.json({
    data: {
      ready: env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET && env.FRONTEND_URL,
      env,
      redirect_uri: instagramRedirectUri(),
      webhook_url: backendUrl("/api/webhooks/instagram"),
      deauthorize_url: backendUrl("/api/instagram/deauthorize"),
      data_deletion_url: backendUrl("/api/instagram/data-deletion"),
      privacy_url: frontendUrl("/privacy"),
    },
  });
}
