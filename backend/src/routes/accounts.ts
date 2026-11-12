import { createAdminClient } from "../lib/supabase/server";
import { connectInstagramAccount } from "../lib/instagram";
import { handOverKnowledgeBeforeDelete, validateKnowledgeSource } from "../lib/agents";
import { invalidateAccountCache } from "../lib/gemini";
import { ownsAccount } from "../lib/tenant";
import type { RouteContext } from "../index";

/**
 * Подключённые каналы. Канал один — Instagram: Telegram-каналы для клиентов убраны
 * (Telegram остался только для уведомлений о заявках). Токены хранятся в таблице
 * accounts и в браузер уходят только замаскированными.
 */

function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, platform, account_name, access_token, webhook_verify_token, status, created_at, platform_account_id, knowledge_source_id")
    .eq("platform", "instagram")
    .eq("company_id", ctx.auth!.company.id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const masked = (data ?? []).map((acc: any) => ({
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

/** Ручное подключение Instagram по токену (основной путь — вход через Instagram, /api/auth/instagram). */
export async function POST(req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const company = ctx.auth!.company.id;
  const body = await req.json();
  const access_token = String(body.access_token ?? "").trim();
  const knowledge_source_id: string | null = body.knowledge_source_id || null;

  if (body.platform && body.platform !== "instagram") {
    return Response.json({ error: "Подключить можно только Instagram." }, { status: 400 });
  }
  if (!access_token) return Response.json({ error: "Укажите Access Token." }, { status: 400 });

  const sourceError = await validateKnowledgeSource(supabase, null, knowledge_source_id, company);
  if (sourceError) return Response.json({ error: sourceError }, { status: 400 });

  // Проверяем токен, узнаём ID аккаунта для вебхуков и подписываемся на messages.
  let profile: { platform_account_id: string; username: string };
  try {
    profile = await connectInstagramAccount(access_token);
  } catch (e: any) {
    return Response.json({ error: `Instagram отклонил токен: ${e?.message ?? e}` }, { status: 400 });
  }

  // Один Instagram — одна компания: иначе вебхук не поймёт, чьи правила и заявки.
  const { data: taken } = await supabase
    .from("accounts")
    .select("id")
    .eq("platform", "instagram")
    .eq("platform_account_id", profile.platform_account_id)
    .limit(1);
  if (taken?.length) return Response.json({ error: `@${profile.username} уже подключён к DexaAI.` }, { status: 409 });

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      platform: "instagram",
      account_name: String(body.account_name ?? "").trim() || `@${profile.username}`,
      access_token,
      webhook_verify_token: body.webhook_verify_token ?? null,
      platform_account_id: profile.platform_account_id,
      knowledge_source_id,
      status: "connected",
      company_id: company,
    })
    .select("id, platform, account_name, status, created_at, webhook_verify_token, platform_account_id, knowledge_source_id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache();
  return Response.json({ data: { ...data, access_token_preview: maskToken(access_token) } });
}

export async function DELETE(req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id обязателен." }, { status: 400 });
  if (!(await ownsAccount(ctx.auth!.company.id, id))) return Response.json({ error: "Аккаунт не найден." }, { status: 404 });

  // ON DELETE CASCADE удалит знания/правила аккаунта,
  // поэтому если к аккаунту подключены другие — сначала передаём знания им.
  await handOverKnowledgeBeforeDelete(supabase, id);

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache();
  return Response.json({ ok: true });
}

/** Привязка аккаунта к агенту: { id, knowledge_source_id: <id агента> | null }. */
export async function PATCH(req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.id) return Response.json({ error: "id обязателен." }, { status: 400 });
  if (!(await ownsAccount(ctx.auth!.company.id, body.id))) return Response.json({ error: "Аккаунт не найден." }, { status: 404 });

  const sourceId: string | null = body.knowledge_source_id || null;
  const sourceError = await validateKnowledgeSource(supabase, body.id, sourceId, ctx.auth!.company.id);
  if (sourceError) return Response.json({ error: sourceError }, { status: 400 });

  const { error } = await supabase.from("accounts").update({ knowledge_source_id: sourceId }).eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  invalidateAccountCache();
  return Response.json({ ok: true });
}
