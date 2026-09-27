import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureTelegramUserListener, isTelegramUserAccount } from "@/lib/telegram";

/**
 * Инициализация фоновых слушателей для всех User-аккаунтов Telegram.
 * Вызывается при старте приложения (например, из middleware).
 * Запускает GramJS event listener для каждого User-аккаунта.
 */
export async function POST() {
  try {
    const supabase = createAdminClient();

    // Загружаем все Telegram-аккаунты
    const { data: accounts, error } = await supabase
      .from("accounts")
      .select("id, platform, account_name, access_token, webhook_verify_token, status")
      .eq("platform", "telegram");

    if (error) {
      return NextResponse.json(
        { error: `Ошибка при загрузке аккаунтов: ${error.message}` },
        { status: 500 }
      );
    }

    const userAccounts = (accounts ?? []).filter((acc: any) =>
      isTelegramUserAccount({ platform: acc.platform, webhook_verify_token: acc.webhook_verify_token })
    );

    // Запускаем listener для каждого User-аккаунта
    const results = await Promise.allSettled(
      userAccounts.map((acc: any) =>
        ensureTelegramUserListener(supabase, {
          id: acc.id,
          platform: acc.platform,
          account_name: acc.account_name,
          access_token: acc.access_token,
          webhook_verify_token: acc.webhook_verify_token,
        })
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled" && r.value !== null).length;
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === null)).length;

    return NextResponse.json({
      ok: true,
      userAccountsCount: userAccounts.length,
      successfulListeners: successful,
      failedListeners: failed,
      details: results.map((r, i) =>
        r.status === "rejected"
          ? {
              account: userAccounts[i]?.account_name,
              status: "error",
              error: (r as any).reason?.message || "Unknown error",
            }
          : r.value === null
            ? {
                account: userAccounts[i]?.account_name,
                status: "error",
                error: "Failed to connect or invalid config",
              }
            : { account: userAccounts[i]?.account_name, status: "polling" }
      ),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Неизвестная ошибка при инициализации listeners" },
      { status: 500 }
    );
  }
}
