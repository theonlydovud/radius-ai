import { handleInstagramWebhook, verifyWebhookSignature } from "../lib/instagram";

/**
 * Общий вебхук Instagram для ВСЕХ подключённых аккаунтов.
 * В Meta for Developers (Instagram → Webhooks) указывается один раз:
 *   Callback URL:  {BACKEND}/api/webhooks/instagram
 *   Verify token:  INSTAGRAM_WEBHOOK_VERIFY_TOKEN
 * Аккаунт определяется по entry.id (accounts.platform_account_id).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || process.env.INSTAGRAM_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    console.warn("[webhooks/instagram] неверная подпись X-Hub-Signature-256 — проверьте INSTAGRAM_APP_SECRET");
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    await handleInstagramWebhook(JSON.parse(raw));
  } catch (err) {
    console.error("[webhooks/instagram] error:", err);
  }
  // Отвечаем сразу: обработка идёт в фоне (см. handleInstagramWebhook).
  return Response.json({ ok: true });
}
