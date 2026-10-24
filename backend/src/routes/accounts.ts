import { createAdminClient } from "../lib/supabase/server";
import { isTelegramUserAccount, serializeTelegramUserConfig } from "../lib/telegram";
import { ensureTelegramUserListener, stopTelegramUserListener } from "../lib/telegram-listener";
import { connectInstagramAccount } from "../lib/instagram";
import { handOverKnowledgeBeforeDelete, validateKnowledgeSource } from "../lib/agents";
import { invalidateAccountCache } from "../lib/gemini";

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
    .select("id, platform, account_name, access_token, webhook_verify_token, status, created_at, platform_account_id, knowledge_source_id")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Токен никогда не уходит в браузер целиком — только маскированный превью.
  const masked = (data ?? []).map((acc: { id: string; platform: string; account_name: string; status: string; created_at: string; webhook_verify_token: string | null; access_token: string | null; platform_account_id: string | null; knowledge_source_id: string | null }) => ({
    id: acc.id,
    platform: acc.platform,
    account_name: acc.account_name,
    status: acc.status,
    created_at: acc.created_at,
    webhook_verify_token: acc.webhook_verify_token,
    access_token_preview: maskToken(acc.access_token ?? ""),
    platform_account_id: acc.platform_account_id,
    knowledge_source_id: acc.knowledge_source_id,
  }));

  return Response.json({ data: masked });
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();

  const { platform, access_token, webhook_verify_token, auth_type, api_id, api_hash, phone_number } = body;
  let account_name: string = body.account_name ?? "";
  const knowledge_source_id: string | null = body.knowledge_source_id || null;

  if (!platform || !access_token || (!account_name && platform !== "instagram")) {
    return Response.json(
      { error: "Поля platform, account_name и access_token (или Bot Token) обязательны." },
      { status: 400 }
    );
  }

  if (!["instagram", "telegram"].includes(platform)) {
    return Response.json({ error: "Неизвестная платформа." }, { status: 400 });
  }

  const sourceError = await validateKnowledgeSource(supabase, null, knowledge_source_id);
  if (sourceError) return Response.json({ error: sourceError }, { status: 400 });

  // Instagram: проверяем токен, узнаём ID аккаунта для вебхуков и подписываемся на messages.
  let platform_account_id: string | null = null;
  if (platform === "instagram") {
    try {
      const profile = await connectInstagramAccount(String(access_token).trim());
      platform_account_id = profile.platform_account_id;
      if (!account_name) account_name = `@${profile.username}`;
    } catch (e: any) {
      return Response.json({ error: `Instagram отклонил токен: ${e?.message ?? e}` }, { status: 400 });
    }
  }

  let finalWebhookVerifyToken = platform === "instagram" ? webhook_verify_token ?? null : null;

  if (platform === "telegram" && auth_type === "user") {
    const parsedApiId = Number(api_id ?? 0);
    const parsedApiHash = String(api_hash ?? "").trim();
    if (!parsedApiId || !parsedApiHash) {
      return Response.json({ error: "Для Telegram User нужен api_id и api_hash." }, { status: 400 });
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
      access_token: String(access_token).trim(),
      webhook_verify_token: finalWebhookVerifyToken,
      platform_account_id,
      knowledge_source_id,
      status: "connected",
    })
    .select("id, platform, account_name, status, created_at, webhook_verify_token, platform_account_id, knowledge_source_id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache();

  const isUser = isTelegramUserAccount({ platform, webhook_verify_token: data.webhook_verify_token });

  // Новый user-аккаунт сразу получает свой слушатель (в фоне, ответ не ждёт MTProto).
  if (isUser) {
    void ensureTelegramUserListener(supabase, {
      id: data.id,
      platform,
      account_name,
      access_token,
      webhook_verify_token: data.webhook_verify_token,
    });
  }
  return Response.json({
    data: {
      ...data,
      access_token_preview: maskToken(access_token),
      is_user_account: isUser,
    },
  });
}

export async function DELETE(req: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id обязателен." }, { status: 400 });

  // Гасим MTProto-клиент аккаунта. ON DELETE CASCADE удалит его знания/правила,
  // поэтому если к аккаунту подключены другие — сначала передаём знания им.
  await stopTelegramUserListener(id);
  await handOverKnowledgeBeforeDelete(supabase, id);

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache();
  return Response.json({ ok: true });
}

/** Привязка аккаунта к агенту: { id, knowledge_source_id: <id агента> | null }. */
export async function PATCH(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.id) return Response.json({ error: "id обязателен." }, { status: 400 });

  const sourceId: string | null = body.knowledge_source_id || null;
  const sourceError = await validateKnowledgeSource(supabase, body.id, sourceId);
  if (sourceError) return Response.json({ error: sourceError }, { status: 400 });

  const { error } = await supabase.from("accounts").update({ knowledge_source_id: sourceId }).eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  invalidateAccountCache();
  return Response.json({ ok: true });
}
