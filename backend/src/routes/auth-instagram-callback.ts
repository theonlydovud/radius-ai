import { createAdminClient } from "../lib/supabase/server";
import { connectInstagramAccount, exchangeCodeForToken, verifyState } from "../lib/instagram";
import { validateKnowledgeSource } from "../lib/agents";
import { invalidateAccountCache } from "../lib/gemini";
import { frontendUrl } from "../lib/urls";

function back(params: Record<string, string>) {
  return Response.redirect(frontendUrl(`/accounts?${new URLSearchParams(params)}`));
}

/**
 * Instagram возвращает сюда ?code=…&state=…. Меняем code на долгий токен,
 * подписываем аккаунт на вебхук и сохраняем (повторный вход обновляет токен).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = verifyState(searchParams.get("state"));

  if (!code) return back({ ig_error: searchParams.get("error_description") || "Вход отменён." });
  const companyId = typeof state?.c === "string" ? state.c : null;
  if (!state || !companyId) return back({ ig_error: "Сессия входа устарела, попробуйте ещё раз." });

  try {
    const token = await exchangeCodeForToken(code);
    const profile = await connectInstagramAccount(token);
    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("accounts")
      .select("id, company_id")
      .eq("platform", "instagram")
      .eq("platform_account_id", profile.platform_account_id)
      .maybeSingle();

    // Один Instagram — одна компания: иначе вебхук не поймёт, чьи правила и заявки.
    if (existing && existing.company_id && existing.company_id !== companyId) {
      return back({ ig_error: `@${profile.username} уже подключён к другой компании в DexaAI.` });
    }
    if (existing) {
      await supabase
        .from("accounts")
        .update({ access_token: token, status: "connected", account_name: `@${profile.username}`, company_id: companyId })
        .eq("id", existing.id);
      return back({ ig: "reconnected", name: profile.username });
    }

    const sourceId = (state.s as string | null) ?? null;
    const sourceError = await validateKnowledgeSource(supabase, null, sourceId, companyId);

    const { error } = await supabase.from("accounts").insert({
      platform: "instagram",
      account_name: `@${profile.username}`,
      access_token: token,
      platform_account_id: profile.platform_account_id,
      knowledge_source_id: sourceError ? null : sourceId,
      status: "connected",
      company_id: companyId,
    });
    if (error) throw new Error(error.message);

    invalidateAccountCache();
    return back({ ig: "connected", name: profile.username });
  } catch (err: any) {
    console.error("[auth/instagram] callback error:", err);
    return back({ ig_error: err?.message ?? "Не удалось подключить Instagram." });
  }
}
