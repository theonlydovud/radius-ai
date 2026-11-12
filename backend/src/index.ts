import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { frontendUrl } from "./lib/urls";
import { refreshInstagramTokens } from "./lib/instagram";
import { startReplyRecovery } from "./lib/reply-recovery";
import { ensureLeadsBotWebhook } from "./lib/lead-notify";
import { sessionUser, type AuthUser } from "./lib/auth";

import * as accounts from "./routes/accounts";
import * as assistant from "./routes/assistant";
import * as cabinet from "./routes/cabinet";
import * as signup from "./routes/signup";
import { ensureDexaBotWebhook } from "./lib/dexa-bot";
import * as accountsTest from "./routes/accounts-test";
import * as authInstagram from "./routes/auth-instagram";
import * as authInstagramCallback from "./routes/auth-instagram-callback";
import * as authSession from "./routes/auth-session";
import * as chat from "./routes/chat";
import * as health from "./routes/health";
import * as instagramConfig from "./routes/instagram-config";
import * as instagramDeauthorize from "./routes/instagram-deauthorize";
import * as knowledge from "./routes/knowledge";
import * as leads from "./routes/leads";
import * as leadsStats from "./routes/leads-stats";
import * as managers from "./routes/managers";
import * as leadsId from "./routes/leads-id";
import * as messages from "./routes/messages";
import * as rules from "./routes/rules";
import * as sessions from "./routes/sessions";
import * as sessionsId from "./routes/sessions-id";
import * as telegramLeadsBot from "./routes/telegram-leads-bot";
import * as settingsLeadNotifications from "./routes/settings-lead-notifications";
import * as webhooksInstagram from "./routes/webhooks-instagram";
import * as webhooksInstagramAccount from "./routes/webhooks-instagram-account";

/**
 * Backend DexaAI (деплой на Render). Хендлеры в routes/* — в формате Route Handlers:
 * `(req: Request, { params, auth }) => Response`, их подключает mount().
 *
 * Доступ: все /api/* требуют входа (куки dexa_u), кроме вебхуков, health и шагов входа.
 * Руководитель (owner) может всё; супер-админ (admin) — все заявки, их переписку и статистику;
 * менеджер — только свои заявки, их переписку и показатели.
 */

export type RouteContext = { params: any; auth?: AuthUser };
type Handler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;
const METHODS = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"] as const;

const app = new Hono<{ Variables: { auth?: AuthUser } }>();

// Фронтенд ходит через rewrites Vercel (same-origin), CORS нужен только
// если кто-то вызывает API напрямую из браузера с другого домена.
app.use(
  "/api/*",
  cors({ origin: process.env.FRONTEND_URL ? frontendUrl() : "*", credentials: true })
);

/** Без входа: вызывают Meta/Telegram/Render или это сами шаги входа. */
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/select",
  "/api/auth/logout",
  "/api/auth/instagram/callback",
  "/api/instagram/deauthorize",
  "/api/instagram/data-deletion",
  "/api/telegram/leads-bot",
  "/api/telegram/dexa-bot",
  "/api/signup/start",
  "/api/signup/status",
  "/api/signup/complete",
]);
const PUBLIC_PREFIXES = ["/api/webhooks/"];

/** Заявки и статистика: всё, что есть у менеджера и супер-админа. Чьи именно заявки — решают сами хендлеры. */
function leadsAllowed(method: string, path: string) {
  if (method === "GET" && (path === "/api/leads" || path === "/api/leads/stats" || path === "/api/messages")) return true;
  if (method === "POST" && path === "/api/leads") return true;
  return method === "PATCH" && /^\/api\/leads\/[^/]+$/.test(path) && path !== "/api/leads/stats";
}

function allowed(role: string, method: string, path: string) {
  if (role === "owner") return true;
  // Супер-админу нужен список менеджеров для фильтра и смены ответственного — только чтение.
  if (role === "admin" && method === "GET" && path === "/api/managers") return true;
  return leadsAllowed(method, path);
}

app.use("/api/*", async (c, next) => {
  const path = c.req.path.replace(/\/+$/, "") || "/";
  if (c.req.method === "OPTIONS" || PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }
  const user = await sessionUser(c.req.raw);
  if (!user) return c.json({ error: "Войдите в аккаунт.", code: "unauthorized" }, 401);
  // Компания зарегистрировалась сама и ещё не подключена: только её кабинет, к данным платформы доступа нет.
  if (user.company.status === "pending" && !path.startsWith("/api/cabinet")) {
    return c.json({ error: "Платформа ещё не подключена для вашей компании.", code: "not_connected" }, 403);
  }
  if (user.company.status !== "pending" && path.startsWith("/api/cabinet")) {
    return c.json({ error: "Кабинет нужен только до подключения.", code: "forbidden" }, 403);
  }
  if (!allowed(user.role, c.req.method, path)) {
    return c.json({ error: "Это доступно только руководителю.", code: "forbidden" }, 403);
  }
  c.set("auth", user);
  return next();
});

function mount(path: string, mod: Partial<Record<(typeof METHODS)[number], Handler>>) {
  for (const method of METHODS) {
    const handler = mod[method];
    if (handler) app.on(method, path, (c) => handler(c.req.raw, { params: c.req.param(), auth: c.get("auth") }));
  }
}

mount("/api/health", health);
mount("/health", health);
mount("/ping", health);
mount("/api/auth/me", authSession.me);
mount("/api/auth/login", authSession.login);
mount("/api/auth/select", authSession.select);
mount("/api/auth/logout", authSession.logout);
mount("/api/accounts", accounts);
mount("/api/assistant", assistant.chat);
mount("/api/signup/start", signup.start);
mount("/api/signup/status", signup.status);
mount("/api/signup/complete", signup.complete);
mount("/api/telegram/dexa-bot", signup.webhook);
mount("/api/cabinet", cabinet.company);
mount("/api/cabinet/connect", cabinet.connect);
mount("/api/assistant/transcribe", assistant.transcribe);
mount("/api/accounts/:id/test", accountsTest);
mount("/api/auth/instagram", authInstagram);
mount("/api/auth/instagram/callback", authInstagramCallback);
mount("/api/instagram/config", instagramConfig);
mount("/api/instagram/deauthorize", instagramDeauthorize);
mount("/api/instagram/data-deletion", instagramDeauthorize);
mount("/api/chat", chat);
mount("/api/knowledge", knowledge);
mount("/api/leads", leads);
mount("/api/leads/stats", leadsStats);
mount("/api/managers", managers);
mount("/api/leads/:id", leadsId);
mount("/api/messages", messages);
mount("/api/rules", rules);
mount("/api/sessions", sessions);
mount("/api/sessions/:id", sessionsId);
mount("/api/settings/lead-notifications", settingsLeadNotifications);
mount("/api/telegram/leads-bot", telegramLeadsBot);
mount("/api/webhooks/instagram", webhooksInstagram);
mount("/api/webhooks/instagram/:accountId", webhooksInstagramAccount);

app.get("/", (c) => c.json({ ok: true, service: "dexa-ai-backend" }));
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(`[http] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: "Внутренняя ошибка сервера." }, 500);
});

const port = Number(process.env.PORT || 4000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[http] backend listening on :${port}`);

  // Долгие токены Instagram живут 60 дней — продлеваем раз в сутки.
  const refreshIg = () => refreshInstagramTokens().catch((e) => console.error("[ig] token refresh failed:", e?.message ?? e));
  setTimeout(refreshIg, 60_000);
  setInterval(refreshIg, 24 * 60 * 60 * 1000).unref();

  startReplyRecovery();

  // Нажатия «✅ Ishga oldim» приходят на вебхук бота заявок.
  ensureLeadsBotWebhook().catch((e) => console.error("[leads-bot] вебхук не настроен:", e?.message ?? e));
  // Регистрация и вход через бота DexaAI.
  ensureDexaBotWebhook().catch((e) => console.error("[dexa-bot] вебхук не настроен:", e?.message ?? e));
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
