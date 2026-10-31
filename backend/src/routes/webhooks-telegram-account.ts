import { createAdminClient } from "../lib/supabase/server";
import { isTelegramUserAccount } from "../lib/telegram";
import { ensureTelegramUserListener } from "../lib/telegram-listener";
import { handleTelegramBotUpdate } from "../lib/telegram-bot";

/**
 * Webhook для конкретного Telegram-аккаунта.
 *
 * URL: POST /api/webhooks/telegram/{accountId}
 * accountId — id строки в таблице accounts (виден на странице «Аккаунты»,
 * кнопка «Скопировать Webhook URL» формирует именно этот адрес).
 *
 * Bot Token НЕ читается из .env — он загружается из accounts.access_token
 * по accountId из URL, поэтому один и тот же код обслуживает произвольное
 * количество независимо подключённых Telegram-ботов.
 *
 * Отвечаем Telegram сразу, а сообщение обрабатываем в фоне: иначе при медленном
 * ответе Telegram шлёт то же сообщение снова, и бот отвечает несколько раз.
 */
export async function POST(
  req: Request,
  { params }: { params: { accountId: string } }
) {
  const supabase = createAdminClient();

  try {
    const { data: account } = await supabase
      .from("accounts")
      .select("id, platform, account_name, access_token, status, webhook_verify_token")
      .eq("id", params.accountId)
      .eq("platform", "telegram")
      .maybeSingle();

    if (!account || !account.access_token) {
      return Response.json({ ok: true });
    }

    if (isTelegramUserAccount(account)) {
      await ensureTelegramUserListener(supabase, account);
      return Response.json({ ok: true });
    }

    handleTelegramBotUpdate(account, await req.json());
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhooks/telegram] error:", err);
    return Response.json({ ok: true });
  }
}
