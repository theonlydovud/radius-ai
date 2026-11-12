import { timingSafeEqual } from "node:crypto";
import { clientIp, COMPANY_COOKIE, companyToken, setCookie, USER_COOKIE, userToken } from "../lib/auth";
import { consumeSignup, createSignup, dexaBotSecret, dexaBotToken, handleDexaBotUpdate, signupStatus } from "../lib/dexa-bot";

/**
 * Регистрация и вход через Telegram (без пароля):
 *   POST /api/signup/start            { lang? }  → { nonce, url }   ссылка t.me/<бот>?start=<код>
 *   GET  /api/signup/status?nonce=…              → { status }       waiting | confirmed | expired | used | unknown
 *   POST /api/signup/complete         { nonce }  → { next }         ставит куки входа
 *   POST /api/telegram/dexa-bot       вебхук бота DexaAI
 */

const json = (data: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(data), { status, headers });
};

// Не больше 20 кодов за 10 минут с одного IP.
const starts = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (starts.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  starts.set(ip, list);
  if (starts.size > 5000) starts.clear();
  return list.length > 20;
}

const validNonce = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);

export const start = {
  async POST(req: Request) {
    const ip = clientIp(req);
    if (tooMany(ip)) return json({ error: "Слишком много попыток. Подождите несколько минут." }, 429);
    const body = await req.json().catch(() => ({}));
    try {
      const lang = ["ru", "uz", "en"].includes(body?.lang) ? body.lang : undefined;
      return json({ data: await createSignup({ lang, ip, userAgent: req.headers.get("user-agent") ?? undefined }) });
    } catch (e: any) {
      console.error("[signup] start:", e?.message);
      return json({ error: "Регистрация через Telegram временно недоступна." }, 503);
    }
  },
};

export const status = {
  async GET(req: Request) {
    const nonce = new URL(req.url).searchParams.get("nonce");
    if (!validNonce(nonce)) return json({ error: "Неверный код." }, 400);
    return json({ data: { status: await signupStatus(nonce) } });
  },
};

export const complete = {
  async POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    if (!validNonce(body?.nonce)) return json({ error: "Неверный код." }, 400);
    const result = await consumeSignup(body.nonce);
    if (!result) return json({ error: "Ссылка устарела. Попробуйте ещё раз." }, 410);
    const { user, company, isNew } = result;
    const next = company.status === "pending" ? "/cabinet" : user.role === "owner" ? "/leads" : user.role === "admin" ? "/admin" : "/crm";
    return json({ data: { next, is_new: isNew, workspace: company.status !== "pending" } }, 200, [
      setCookie(COMPANY_COOKIE, companyToken(company), req),
      setCookie(USER_COOKIE, userToken(user), req),
    ]);
  },
};

/** Вебхук бота DexaAI: секрет в заголовке, ответ сразу, обработка в фоне. */
export const webhook = {
  async POST(req: Request) {
    const token = dexaBotToken();
    const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
    const expected = Buffer.from(token ? dexaBotSecret(token) : "");
    if (!token || got.length !== expected.length || !timingSafeEqual(got, expected)) return new Response("Forbidden", { status: 403 });
    const update = await req.json().catch(() => null);
    void handleDexaBotUpdate(update).catch((e) => console.error("[dexa-bot] ошибка:", e?.message ?? e));
    return Response.json({ ok: true });
  },
};
