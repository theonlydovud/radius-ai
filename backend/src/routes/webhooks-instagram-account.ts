import { createAdminClient } from "../lib/supabase/server";
import { handleInstagramWebhook, verifyWebhookSignature } from "../lib/instagram";

/**
 * Вебхук конкретного Instagram-аккаунта (старая схема, оставлена для
 * совместимости): GET/POST /api/webhooks/instagram/{accountId}.
 * Новые аккаунты используют общий /api/webhooks/instagram.
 */
export async function GET(
  req: Request,
  { params }: { params: { accountId: string } }
) {
  const supabase = createAdminClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, webhook_verify_token")
    .eq("id", params.accountId)
    .eq("platform", "instagram")
    .maybeSingle();

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const allowed = [account?.webhook_verify_token, process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN].filter(Boolean);

  if (account && mode === "subscribe" && token && allowed.includes(token)) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(
  req: Request,
  { params }: { params: { accountId: string } }
) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    await handleInstagramWebhook(JSON.parse(raw), params.accountId);
  } catch (err) {
    console.error("[webhooks/instagram] error:", err);
  }
  return Response.json({ ok: true });
}
