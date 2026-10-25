import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { frontendUrl } from "./lib/urls";
import { startAllTelegramListeners, stopTelegramUserListener } from "./lib/telegram-listener";
import { refreshInstagramTokens } from "./lib/instagram";

import * as accounts from "./routes/accounts";
import * as accountsTest from "./routes/accounts-test";
import * as authInstagram from "./routes/auth-instagram";
import * as authInstagramCallback from "./routes/auth-instagram-callback";
import * as chat from "./routes/chat";
import * as health from "./routes/health";
import * as initListeners from "./routes/init-listeners";
import * as instagramConfig from "./routes/instagram-config";
import * as knowledge from "./routes/knowledge";
import * as leads from "./routes/leads";
import * as leadsId from "./routes/leads-id";
import * as messages from "./routes/messages";
import * as rules from "./routes/rules";
import * as sessions from "./routes/sessions";
import * as sessionsId from "./routes/sessions-id";
import * as settingsLeadNotifications from "./routes/settings-lead-notifications";
import * as telegramAuthConfirm from "./routes/telegram-auth-confirm";
import * as telegramAuthStart from "./routes/telegram-auth-start";
import * as webhooksInstagram from "./routes/webhooks-instagram";
import * as webhooksInstagramAccount from "./routes/webhooks-instagram-account";
import * as webhooksTelegram from "./routes/webhooks-telegram";
import * as webhooksTelegramAccount from "./routes/webhooks-telegram-account";

/**
 * Backend Radius AI (деплой на Render). Тот же API, что раньше жил в
 * Next.js Route Handlers (src/app/api/**), но без Next.js — только HTTP +
 * MTProto-слушатели, поэтому процесс ест заметно меньше RAM.
 *
 * Хендлеры в routes/* остались в формате Route Handlers:
 * `(req: Request, { params }) => Response`, их подключает mount().
 */

type Handler = (req: Request, ctx: { params: any }) => Response | Promise<Response>;
const METHODS = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] as const;

const app = new Hono();

// Фронтенд ходит через rewrites Vercel (same-origin), CORS нужен только
// если кто-то вызывает API напрямую из браузера с другого домена.
app.use(
  "/api/*",
  cors({ origin: process.env.FRONTEND_URL ? frontendUrl() : "*" })
);

function mount(path: string, mod: Partial<Record<(typeof METHODS)[number], Handler>>) {
  for (const method of METHODS) {
    const handler = mod[method];
    if (handler) app.on(method, path, (c) => handler(c.req.raw, { params: c.req.param() }));
  }
}

mount("/api/health", health);
mount("/health", health);
mount("/ping", health);
mount("/api/accounts", accounts);
mount("/api/accounts/:id/test", accountsTest);
mount("/api/auth/instagram", authInstagram);
mount("/api/auth/instagram/callback", authInstagramCallback);
mount("/api/instagram/config", instagramConfig);
mount("/api/chat", chat);
mount("/api/init-listeners", initListeners);
mount("/api/knowledge", knowledge);
mount("/api/leads", leads);
mount("/api/leads/:id", leadsId);
mount("/api/messages", messages);
mount("/api/rules", rules);
mount("/api/sessions", sessions);
mount("/api/sessions/:id", sessionsId);
mount("/api/settings/lead-notifications", settingsLeadNotifications);
mount("/api/telegram/auth/start", telegramAuthStart);
mount("/api/telegram/auth/confirm", telegramAuthConfirm);
mount("/api/webhooks/instagram", webhooksInstagram);
mount("/api/webhooks/instagram/:accountId", webhooksInstagramAccount);
mount("/api/webhooks/telegram", webhooksTelegram);
mount("/api/webhooks/telegram/:accountId", webhooksTelegramAccount);

app.get("/", (c) => c.json({ ok: true, service: "radius-ai-backend" }));
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(`[http] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: "Внутренняя ошибка сервера." }, 500);
});

const port = Number(process.env.PORT || 4000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[http] backend listening on :${port}`);

  // Намеренно БЕЗ await: HTTP-сервер (и Render Health Check) не ждёт MTProto.
  // Подключение аккаунтов идёт параллельно и в фоне.
  startAllTelegramListeners()
    .then((r) => console.log(`[tg] listeners started: ${r.listening}/${r.total}`))
    .catch((e) => console.error("[tg] listeners bootstrap failed:", e?.message ?? e));

  // Долгие токены Instagram живут 60 дней — продлеваем раз в сутки.
  const refreshIg = () => refreshInstagramTokens().catch((e) => console.error("[ig] token refresh failed:", e?.message ?? e));
  setTimeout(refreshIg, 60_000);
  setInterval(refreshIg, 24 * 60 * 60 * 1000).unref();
});

// При редеплое Render шлёт SIGTERM старому инстансу. Корректно закрываем
// MTProto-сессии, чтобы новый инстанс не словил AUTH_KEY_DUPLICATED.
async function shutdown(signal: string) {
  console.log(`[http] ${signal}: stopping telegram listeners`);
  const ids = [...(((globalThis as any).__radiusTg?.clients as Map<string, unknown>)?.keys() ?? [])];
  await Promise.race([
    Promise.all(ids.map((id) => stopTelegramUserListener(id))),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
