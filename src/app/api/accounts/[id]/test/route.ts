import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTelegramUserInfo, parseTelegramUserConfig, setTelegramBotWebhook, validateTelegramBotToken } from "@/lib/telegram";

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
    return NextResponse.json({ error: "Аккаунт не найден." }, { status: 404 });
  }

  const origin = new URL(req.url).origin;

  try {
    if (account.platform === "telegram") {
      const telegramUserConfig = parseTelegramUserConfig(account.webhook_verify_token ?? null);

      if (telegramUserConfig) {
        const userInfo = await getTelegramUserInfo({
          access_token: account.access_token,
          webhook_verify_token: account.webhook_verify_token,
        });

        await setStatus(supabase, account.id, userInfo.ok ? "connected" : "error");
        return NextResponse.json({
          ok: userInfo.ok,
          message: userInfo.ok
            ? `Пользователь @${userInfo.me?.username ?? "telegram"} подключён через MTProto.`
            : userInfo.message,
        });
      }

      const meRes = await validateTelegramBotToken(account.access_token);
      if (!meRes.ok) {
        await setStatus(supabase, account.id, "error");
        return NextResponse.json(
          { ok: false, message: meRes.description ?? "Неверный Bot Token." },
          { status: 200 }
        );
      }

      const webhookUrl = `${origin}/api/webhooks/telegram/${account.id}`;
      const hookRes = await setTelegramBotWebhook(account.access_token, webhookUrl);

      await setStatus(supabase, account.id, "connected");
      return NextResponse.json({
        ok: true,
        message: `Бот @${meRes.result.username} подключён.${
          hookRes.ok ? " Webhook установлен автоматически." : ""
        }`,
      });
    }

    if (account.platform === "instagram") {
      const meRes = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${account.access_token}`
      );
      const me = await meRes.json();

      if (me.error) {
        await setStatus(supabase, account.id, "error");
        return NextResponse.json(
          { ok: false, message: me.error.message ?? "Неверный Access Token." },
          { status: 200 }
        );
      }

      await setStatus(supabase, account.id, "connected");
      return NextResponse.json({
        ok: true,
        message: `Страница «${me.name}» доступна. Не забудьте указать этот URL и Verify Token в Meta for Developers.`,
      });
    }

    return NextResponse.json({ ok: false, message: "Неизвестная платформа." });
  } catch (err) {
    await setStatus(supabase, account.id, "error");
    return NextResponse.json(
      { ok: false, message: "Не удалось связаться с API платформы. Проверьте токен и сеть." },
      { status: 200 }
    );
  }
}

async function setStatus(supabase: any, id: string, status: "connected" | "error") {
  await supabase.from("accounts").update({ status }).eq("id", id);
}
