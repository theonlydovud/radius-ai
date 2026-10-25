import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../lib/supabase/server";
import { frontendUrl } from "../lib/urls";

/**
 * Колбэки из «Business login settings» приложения Meta. Meta шлёт POST с
 * полем signed_request (подпись HMAC-SHA256 секретом Instagram-приложения).
 *   /api/instagram/deauthorize   — владелец аккаунта отозвал доступ
 *   /api/instagram/data-deletion — запрос на удаление данных
 */

function parseSignedRequest(signed: string | null): { user_id?: string } | null {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!signed || !secret) return null;
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const got = sig.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

async function readSigned(req: Request) {
  const form = await req.formData().catch(() => null);
  return parseSignedRequest((form?.get("signed_request") as string | null) ?? null);
}

export async function POST(req: Request) {
  const data = await readSigned(req);
  if (!data?.user_id) return new Response("Invalid signed_request", { status: 400 });

  const isDeletion = new URL(req.url).pathname.endsWith("/data-deletion");
  const supabase = createAdminClient();

  // В обоих случаях отключаем аккаунт: токен больше недействителен.
  await supabase
    .from("accounts")
    .update({ status: "disconnected" })
    .eq("platform", "instagram")
    .eq("platform_account_id", String(data.user_id));

  if (!isDeletion) {
    console.log(`[ig] deauthorize: аккаунт ${data.user_id} отозвал доступ`);
    return Response.json({ ok: true });
  }

  const code = randomBytes(6).toString("hex");
  console.log(`[ig] data deletion request: аккаунт ${data.user_id}, код ${code}`);
  // Формат ответа, который ожидает Meta.
  return Response.json({ url: frontendUrl(`/privacy?deletion=${code}#data-deletion`), confirmation_code: code });
}
