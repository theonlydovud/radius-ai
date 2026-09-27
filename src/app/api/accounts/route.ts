import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isTelegramUserAccount, serializeTelegramUserConfig, stopTelegramUserPolling } from "@/lib/telegram";

/**
 * Токены (access_token, webhook_verify_token) хранятся ИСКЛЮЧИТЕЛЬНО в
 * таблице accounts в Supabase — никаких .env-переменных с секретами
 * конкретного аккаунта. Каждый подключённый Instagram/Telegram-аккаунт
 * может иметь свой собственный токен, и все они читаются динамически
 * из БД в момент обработки вебхука (см. api/webhooks/.../[accountId]).
 */

function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, platform, account_name, access_token, webhook_verify_token, status, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Токен никогда не уходит в браузер целиком — только маскированный превью.
  const masked = (data ?? []).map((acc: { id: string; platform: string; account_name: string; status: string; created_at: string; webhook_verify_token: string | null; access_token: string | null }) => ({
    id: acc.id,
    platform: acc.platform,
    account_name: acc.account_name,
    status: acc.status,
    created_at: acc.created_at,
    webhook_verify_token: acc.webhook_verify_token,
    access_token_preview: maskToken(acc.access_token ?? ""),
  }));

  return NextResponse.json({ data: masked });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  const { platform, account_name, access_token, webhook_verify_token, auth_type, api_id, api_hash, phone_number } = body;

  if (!platform || !account_name || !access_token) {
    return NextResponse.json(
      { error: "Поля platform, account_name и access_token (или Bot Token) обязательны." },
      { status: 400 }
    );
  }

  if (!["instagram", "telegram"].includes(platform)) {
    return NextResponse.json({ error: "Неизвестная платформа." }, { status: 400 });
  }

  let finalWebhookVerifyToken = platform === "instagram" ? webhook_verify_token ?? null : null;

  if (platform === "telegram" && auth_type === "user") {
    const parsedApiId = Number(api_id ?? 0);
    const parsedApiHash = String(api_hash ?? "").trim();
    if (!parsedApiId || !parsedApiHash) {
      return NextResponse.json({ error: "Для Telegram User нужен api_id и api_hash." }, { status: 400 });
    }

    finalWebhookVerifyToken = serializeTelegramUserConfig({
      auth_type: "user",
      api_id: parsedApiId,
      api_hash: parsedApiHash,
      phone_number: phone_number ? String(phone_number) : undefined,
    });
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      platform,
      account_name,
      access_token,
      webhook_verify_token: finalWebhookVerifyToken,
      status: "connected",
    })
    .select("id, platform, account_name, status, created_at, webhook_verify_token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isUser = isTelegramUserAccount({ platform, webhook_verify_token: data.webhook_verify_token });
  return NextResponse.json({
    data: {
      ...data,
      access_token_preview: maskToken(access_token),
      is_user_account: isUser,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен." }, { status: 400 });

  // Остановляем polling для Telegram User-аккаунта, если он был активен
  stopTelegramUserPolling(id);

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
