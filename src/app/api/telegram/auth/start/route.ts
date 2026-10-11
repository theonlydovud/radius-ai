import { NextResponse } from "next/server";
import { startTelegramUserLogin } from "@/lib/telegram";

// Без этого Next.js выполняет GET один раз при `next build` и отдаёт замороженный результат.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phoneNumber = String(body.phone_number ?? "").trim();
    const apiId = Number(body.api_id ?? 0);
    const apiHash = String(body.api_hash ?? "").trim();

    if (!phoneNumber || !apiId || !apiHash) {
      return NextResponse.json(
        { ok: false, message: "Нужны phone_number, api_id и api_hash." },
        { status: 400 }
      );
    }

    const result = await startTelegramUserLogin(phoneNumber, apiId, apiHash);

    return NextResponse.json({
      ok: true,
      message: "Код отправлен в Telegram.",
      phoneCodeHash: result.phoneCodeHash,
      sessionString: result.sessionString,
      isCodeViaApp: result.isCodeViaApp,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? "Не удалось отправить код Telegram." },
      { status: 200 }
    );
  }
}
