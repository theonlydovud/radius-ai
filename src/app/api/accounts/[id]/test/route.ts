import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Проверяет соединение для аккаунта, читая его токен ИЗ БД (никогда из
 * .env) и дёргая соответствующий API платформы:
 *  - Telegram: getMe (валидность bot-токена) + setWebhook на
 *    сгенерированный URL этого аккаунта, чтобы полностью автоматизировать
 *    привязку.
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
    .select("id, platform, access_token")
    .eq("id", params.id)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: "Аккаунт не найден." }, { status: 404 });
  }

  const origin = new URL(req.url).origin;

  try {
    if (account.platform === "telegram") {
      const meRes = await fetch(
        `https://api.telegram.org/bot${account.access_token}/getMe`
      );
      const me = await meRes.json();

      if (!me.ok) {
        await setStatus(supabase, account.id, "error");
        return NextResponse.json(
          { ok: false, message: me.description ?? "Неверный Bot Token." },
          { status: 200 }
        );
      }

      const webhookUrl = `${origin}/api/webhooks/telegram/${account.id}`;
      const hookRes = await fetch(
        `https://api.telegram.org/bot${account.access_token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      );
      const hook = await hookRes.json();

      await setStatus(supabase, account.id, "connected");
      return NextResponse.json({
        ok: true,
        message: `Бот @${me.result.username} подключён.${
          hook.ok ? " Webhook установлен автоматически." : ""
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
