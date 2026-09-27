/**
 * Инициализация Telegram User-аккаунтов слушателей при старте сервера.
 * Этот модуль импортируется один раз и запускает фоновые listeners.
 */

let initialized = false;

export async function initTelegramListeners() {
  if (initialized) return;
  initialized = true;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/init-listeners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      console.warn(
        `[Telegram Listeners Init] HTTP ${response.status}: ${response.statusText}`
      );
    } else {
      const data = await response.json();
      console.log(
        `[Telegram Listeners Init] Successfully initialized ${data.userAccountsCount} User-accounts (${data.successfulListeners} listening)`
      );
    }
  } catch (error: any) {
    console.warn(
      `[Telegram Listeners Init] Failed to initialize:`,
      error?.message || error
    );
  }
}
