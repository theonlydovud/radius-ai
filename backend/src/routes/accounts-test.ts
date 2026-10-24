import { connectInstagramAccount } from "../lib/instagram";
import { backendUrl } from "../lib/urls";
import { createAdminClient } from "../lib/supabase/server";
import { parseTelegramUserConfig, setTelegramBotWebhook, validateTelegramBotToken } from "../lib/telegram";
import { getTelegramUserInfoForAccount } from "../lib/telegram-listener";

/**
 * Проверяет соединение для аккаунта, читая его токен ИЗ БД (никогда из
 * .env) и дёргая соответствующий API платформы:
 *  - Telegram Bot: getMe (валидность bot-токена) + setWebhook на
 *    сгенерированный URL этого аккаунта, чтобы полностью автоматизировать
 *    привязку.
 *  - Telegram User (MTProto/GramJS): авторизация через `session_string`
 *    и проверка `getMe`.
 *  - Instagram: GET /me через Graph API (валидность Page Access Token).
 * Результат обновляет accounts.status на 'connected' или 'error'.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, platform, access_token, webhook_verify_token")
    .eq("id", params.id)
    .single();

  if (error || !account) {
    return Response.json({ error: "Аккаунт не найден." }, { status: 404 });
  }

  // Вебхук должен смотреть прямо на backend (Render), а не на Vercel-прокси.
  const origin = backendUrl("", new URL(req.url).origin);

  try {
    if (account.platform === "telegram") {
      const telegramUserConfig = parseTelegramUserConfig(account.webhook_verify_token ?? null);

      if (telegramUserConfig) {
        const userInfo = await getTelegramUserInfoForAccount({
          id: account.id,
          platform: "telegram",
          account_name: "",
          access_token: account.access_token,
          webhook_verify_token: account.webhook_verify_token,
        });

        await setStatus(supabase, account.id, userInfo.ok ? "connected" : "error");
        return Response.json({
          ok: userInfo.ok,
          message: userInfo.ok
            ? `Пользователь @${userInfo.me?.username ?? "telegram"} подключён через MTProto.`
            : userInfo.message,
        });
      }

      const meRes = await validateTelegramBotToken(account.access_token);
      if (!meRes.ok) {
        await setStatus(supabase, account.id, "error");
        return Response.json(
          { ok: false, message: meRes.description ?? "Неверный Bot Token." },
          { status: 200 }
        );
      }

      const webhookUrl = `${origin}/api/webhooks/telegram/${account.id}`;
      const hookRes = await setTelegramBotWebhook(account.access_token, webhookUrl);

      await setStatus(supabase, account.id, "connected");
      return Response.json({
        ok: true,
        message: `Бот @${meRes.result.username} подключён.${
          hookRes.ok ? " Webhook установлен автоматически." : ""
        }`,
      });
    }

    if (account.platform === "instagram") {
      try {
        // Проверка токена + повторная подписка на вебхук messages (идемпотентно).
        const profile = await connectInstagramAccount(account.access_token);
        await supabase
          .from("accounts")
          .update({ status: "connected", platform_account_id: profile.platform_account_id })
          .eq("id", account.id);
        return Response.json({
          ok: true,
          message: `Instagram @${profile.username} подключён, вебхук messages активен.`,
        });
      } catch (e: any) {
        await setStatus(supabase, account.id, "error");
        return Response.json({ ok: false, message: e?.message ?? "Неверный Access Token." }, { status: 200 });
      }
    }

    return Response.json({ ok: false, message: "Неизвестная платформа." });
  } catch (err) {
    await setStatus(supabase, account.id, "error");
    return Response.json(
      { ok: false, message: "Не удалось связаться с API платформы. Проверьте токен и сеть." },
      { status: 200 }
    );
  }
}

async function setStatus(supabase: any, id: string, status: "connected" | "error") {
  await supabase.from("accounts").update({ status }).eq("id", id);
}
