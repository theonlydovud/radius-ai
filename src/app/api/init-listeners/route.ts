import { NextResponse } from "next/server";
import { startAllTelegramListeners } from "@/lib/telegram-listener";

// Без этого Next.js выполняет GET один раз при `next build` и отдаёт замороженный результат.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Ручной «пинок» синхронизации слушателей (идемпотентно). В штатном режиме
 * не нужен: слушатели стартуют из src/instrumentation.ts, а watchdog раз в
 * минуту подхватывает новые аккаунты.
 */
export async function POST() {
  try {
    const r = await startAllTelegramListeners();
    return NextResponse.json({
      ok: true,
      userAccountsCount: r.total,
      successfulListeners: r.listening,
      failedListeners: r.failed,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Ошибка инициализации listeners" }, { status: 500 });
  }
}
