import { NextResponse } from "next/server";
import { finishTelegramUserLogin } from "@/lib/telegram";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phoneNumber = String(body.phone_number ?? "").trim();
    const apiId = Number(body.api_id ?? 0);
    const apiHash = String(body.api_hash ?? "").trim();
    const phoneCode = String(body.phone_code ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!phoneNumber || !apiId || !apiHash || !phoneCode) {
      return NextResponse.json(
        { ok: false, message: "Нужны phone_number, api_id, api_hash и phone_code." },
        { status: 400 }
      );
    }

    const result = await finishTelegramUserLogin(phoneNumber, apiId, apiHash, phoneCode, password || undefined);

    return NextResponse.json({
      ok: true,
      message: "Telegram-аккаунт успешно привязан.",
      sessionString: result.sessionString,
      username: result.username,
      firstName: result.firstName,
      lastName: result.lastName,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? "Не удалось подтвердить код Telegram." },
      { status: 200 }
    );
  }
}
