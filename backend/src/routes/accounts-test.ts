import { connectInstagramAccount, getInstagramSubscriptions } from "../lib/instagram";
import { createAdminClient } from "../lib/supabase/server";
import type { RouteContext } from "../index";

/**
 * Проверка Instagram-аккаунта: токен читается из БД, Graph API /me подтверждает
 * его и заново подписывает аккаунт на вебхук messages. Результат — accounts.status.
 */
export async function POST(_req: Request, { params, auth }: RouteContext) {
  const supabase = createAdminClient();

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, platform, access_token")
    .eq("id", params.id)
    .eq("company_id", auth!.company.id)
    .maybeSingle();

  if (error || !account) {
    return Response.json({ error: "Аккаунт не найден." }, { status: 404 });
  }
  if (account.platform !== "instagram") {
    return Response.json({ ok: false, message: "Поддерживается только Instagram." });
  }

  try {
    // Проверка токена + повторная подписка на вебхук messages (идемпотентно).
    const profile = await connectInstagramAccount(account.access_token);
    await supabase
      .from("accounts")
      .update({ status: "connected", platform_account_id: profile.platform_account_id })
      .eq("id", account.id);
    const fields = await getInstagramSubscriptions(account.access_token).catch((e: any) => {
      console.warn(`[ig] не удалось прочитать подписки: ${e?.message}`);
      return null;
    });
    console.log(`[ig] проверка @${profile.username}: id=${profile.platform_account_id}, подписки=${fields?.join(",") ?? "?"}`);
    if (fields && !fields.includes("messages")) {
      return Response.json({
        ok: false,
        message: `@${profile.username}: Meta не подписала аккаунт на сообщения (подписки: ${fields.join(", ") || "нет"}).`,
      });
    }
    return Response.json({
      ok: true,
      message: `Instagram @${profile.username} подключён. Подписка Meta: ${fields?.join(", ") ?? "не удалось проверить"}.`,
    });
  } catch (e: any) {
    await supabase.from("accounts").update({ status: "error" }).eq("id", account.id);
    return Response.json({ ok: false, message: e?.message ?? "Неверный Access Token." });
  }
}
