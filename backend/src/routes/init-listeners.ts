import { startAllTelegramListeners } from "../lib/telegram-listener";

/**
 * Ручной «пинок» синхронизации слушателей (идемпотентно). В штатном режиме
 * не нужен: слушатели стартуют из src/instrumentation.ts, а watchdog раз в
 * минуту подхватывает новые аккаунты.
 */
export async function POST() {
  try {
    const r = await startAllTelegramListeners();
    return Response.json({
      ok: true,
      userAccountsCount: r.total,
      successfulListeners: r.listening,
      failedListeners: r.failed,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message ?? "Ошибка инициализации listeners" }, { status: 500 });
  }
}
