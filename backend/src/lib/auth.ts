import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createAdminClient } from "./supabase/server";
import { ALL_FEATURES, findPlan, getPlans, type Features, type Plan } from "./plans";

/**
 * Вход в DexaAI. Два шага, оба запоминаются на устройстве на год (httpOnly-куки):
 *   1. Компания: логин/пароль компании (radius_logistics) → кука dexa_c.
 *   2. Человек: выбор из списка + личный пароль → кука dexa_u.
 * Личным логином (jasur_radius) можно войти и сразу — тогда ставятся обе куки.
 *
 * Куки — подписанные HMAC токены, без таблицы сессий. В токене лежит отпечаток
 * хеша пароля: смена пароля в БД сразу разлогинивает все устройства.
 * Роли: owner (руководитель) — всё; admin (супер-админ) — все заявки и статистика, больше ничего;
 * manager — только свои заявки и показатели.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const COMPANY_COOKIE = "dexa_c";
export const USER_COOKIE = "dexa_u";
const YEAR_S = 365 * 24 * 60 * 60;

export type Role = "owner" | "manager" | "admin";
/**
 * active  — платная, работает без ограничений;
 * trial   — зарегистрировались сами: всё открыто 14 дней (TRIAL_DAYS);
 * expired — пробный период закончился: доступен только кабинет.
 */
export type CompanyStatus = "active" | "trial" | "expired";
export type LeadKind = "cargo" | "generic";
export type AuthCompany = {
  id: string;
  name: string;
  status: CompanyStatus;
  trial_ends_at: string | null;
  /** Поддомен (radius → radius.dexa.uz). Нет — компания работает на dexa.uz. */
  subdomain: string | null;
  lead_kind: LeadKind;
  /** Уведомления о заявках в свою Telegram-группу (бот заявок). */
  telegram_leads: boolean;
  /** Наша компания (Radius): без тарифных ограничений, лимита сообщений и правила «одно устройство». */
  unlimited: boolean;
  /** Тариф; у unlimited-компаний — null. */
  plan: { code: string; name: string; price: number } | null;
  /** Что открыто тарифом. Проверяется в index.ts и в хендлерах, меню строится по этим же флагам. */
  features: Features;
  usage: {
    messages_used: number;
    /** null — без лимита. */
    messages_limit: number | null;
    /** Конец пробного или оплаченного периода. */
    period_end: string | null;
    /** Сколько человек может работать (владелец + менеджеры); null — без лимита. */
    users_limit: number | null;
    instagram_accounts: number | null;
  };
  /** Почему бот не отвечает клиентам: кончились сообщения или оплаченный период. */
  ai_blocked: "limit" | "period" | null;
};
export const TRIAL_DAYS = 14;
export type AuthUser = { id: string; name: string; role: Role; manager_id: string | null; company: AuthCompany };

// ---------------------------------------------------------------------
// Пароли: scrypt$N$r$p$salt$hash (base64)
// ---------------------------------------------------------------------

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [kind, n, r, p, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------
// Подписанные токены
// ---------------------------------------------------------------------

function secret() {
  // AUTH_SECRET можно не задавать: тогда ключ выводится из service role key,
  // который и так есть только у backend.
  const base = process.env.AUTH_SECRET || `dexa-auth:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  return createHash("sha256").update(base).digest();
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function sign(payload: Record<string, unknown>) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

function unsign(token: string | undefined): Record<string, any> | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

/** Отпечаток хеша пароля: меняется вместе с паролем. */
const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);

/** У вошедших через Telegram пароля нет — отпечаток от Telegram ID (или от id компании). */
const companyStamp = (c: { id: string; password_hash?: string | null }) => fingerprint(c.password_hash ?? `co:${c.id}`);
const userStamp = (u: { id: string; password_hash?: string | null; telegram_id?: number | string | null }) =>
  fingerprint(u.password_hash ?? `tg:${u.telegram_id ?? u.id}`);

export function companyToken(company: { id: string; password_hash?: string | null }) {
  return sign({ t: "c", id: company.id, v: companyStamp(company), exp: Math.floor(Date.now() / 1000) + YEAR_S });
}

export function userToken(user: { id: string; password_hash?: string | null; telegram_id?: number | string | null }, sessionId?: string) {
  return sign({ t: "u", id: user.id, v: userStamp(user), ...(sessionId ? { s: sessionId } : {}), exp: Math.floor(Date.now() / 1000) + YEAR_S });
}

// ---------------------------------------------------------------------
// Куки
// ---------------------------------------------------------------------

export function readCookies(req: Request) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function secureCookies() {
  return /^https:/i.test(process.env.FRONTEND_URL ?? "") || process.env.NODE_ENV === "production";
}

/**
 * Общий домен для куки входа. Вход на dexa.uz должен действовать и на radius.dexa.uz
 * (и других поддоменах компаний), поэтому для запросов с этих адресов кука ставится
 * на весь домен. Адрес берём из Origin (браузер шлёт его на POST), иначе — из
 * x-forwarded-host / Referer. Для прочих адресов (vercel.app, localhost) — как раньше.
 */
const COOKIE_DOMAIN = (process.env.COOKIE_DOMAIN || "dexa.uz").toLowerCase();

export function cookieDomainFor(req: Request): string | null {
  for (const header of ["origin", "x-forwarded-host", "referer"]) {
    const raw = req.headers.get(header);
    if (!raw) continue;
    let host = raw;
    try {
      host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
    } catch {
      continue;
    }
    host = host.toLowerCase();
    return host === COOKIE_DOMAIN || host.endsWith(`.${COOKIE_DOMAIN}`) ? COOKIE_DOMAIN : null;
  }
  return null;
}

function attrs(req: Request) {
  const domain = cookieDomainFor(req);
  return `Path=/; HttpOnly; SameSite=Lax${secureCookies() ? "; Secure" : ""}${domain ? `; Domain=${domain}` : ""}`;
}

export function setCookie(name: string, value: string, req: Request) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${YEAR_S}; ${attrs(req)}`;
}

/** Стираем и общую куку, и привязанную к одному адресу (она могла остаться от прежних входов). */
export function clearCookie(name: string, req: Request): string[] {
  const hostOnly = `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secureCookies() ? "; Secure" : ""}`;
  return cookieDomainFor(req) ? [`${name}=; Max-Age=0; ${attrs(req)}`, hostOnly] : [hostOnly];
}

// ---------------------------------------------------------------------
// Кто пришёл
// ---------------------------------------------------------------------

type CompanyRow = {
  id: string;
  name: string;
  login: string | null;
  password_hash: string | null;
  status?: string | null;
  created_at?: string | null;
  trial_ends_at?: string | null;
  subdomain?: string | null;
  lead_kind?: string | null;
  telegram_leads?: boolean | null;
  unlimited?: boolean | null;
  plan?: string | null;
  period_end?: string | null;
  messages_used?: number | null;
  extra_users?: number | null;
};
type UserRow = {
  /** id текущего входа: у обычных компаний действует только последний вход (одно устройство). */
  session_id?: string | null;
  id: string;
  company_id: string;
  name: string;
  role: Role;
  login: string | null;
  password_hash: string | null;
  telegram_id?: number | null;
  manager_id: string | null;
  is_active: boolean;
  sort_order: number;
};

// Короткий кэш: проверка куки на каждый запрос не должна каждый раз ходить в БД.
const cache = new Map<string, { at: number; value: any }>();
const CACHE_MS = 30_000;

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.clear();
  return value;
}

export function invalidateAuthCache() {
  cache.clear();
}

async function companyById(id: string) {
  return cached(`c:${id}`, async () => {
    const { data } = await createAdminClient().from("companies").select("*").eq("id", id).maybeSingle();
    return (data as CompanyRow | null) ?? null;
  });
}

async function userById(id: string) {
  return cached(`u:${id}`, async () => {
    const { data } = await createAdminClient()
      .from("app_users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as UserRow | null) ?? null;
  });
}

/** Компания из куки dexa_c (или из куки пользователя — его компания). */
export async function sessionCompany(req: Request): Promise<AuthCompany | null> {
  const cookies = readCookies(req);
  const c = unsign(cookies[COMPANY_COOKIE]);
  if (c?.t === "c") {
    const company = await companyById(c.id);
    if (company && companyStamp(company) === c.v) return describeCompany(company);
  }
  const user = await sessionUser(req);
  return user?.company ?? null;
}

/**
 * Кто вошёл. replaced = кука настоящая, но в этот аккаунт позже вошли с другого
 * устройства (один аккаунт — одно устройство; у unlimited-компаний не действует).
 */
export async function sessionState(req: Request): Promise<{ user: AuthUser | null; replaced: boolean }> {
  const none = { user: null, replaced: false };
  const u = unsign(readCookies(req)[USER_COOKIE]);
  if (u?.t !== "u") return none;
  const user = await userById(u.id);
  if (!user || !user.is_active || userStamp(user) !== u.v) return none;
  const row = await companyById(user.company_id);
  if (!row) return none;
  const company = await describeCompany(row);
  if (!company.unlimited && (u.s ?? null) !== (user.session_id ?? null)) return { user: null, replaced: true };
  return { user: { id: user.id, name: user.name, role: user.role, manager_id: user.manager_id, company }, replaced: false };
}

export async function sessionUser(req: Request): Promise<AuthUser | null> {
  return (await sessionState(req)).user;
}

/**
 * Новый вход человека: возвращает токен для куки. У обычных компаний каждый вход
 * получает свой id и записывается в app_users.session_id — прежнее устройство выходит.
 */
export async function startSession(user: UserRow, company: CompanyRow): Promise<string> {
  if (company.unlimited === true) return userToken(user);
  const sessionId = randomBytes(12).toString("base64url");
  const { error } = await createAdminClient().from("app_users").update({ session_id: sessionId }).eq("id", user.id);
  // Колонки ещё нет (migration-plans.sql не выполнена) — входим по-старому, без привязки к устройству.
  if (error) return userToken(user);
  invalidateAuthCache();
  return userToken(user, sessionId);
}

/** Конец пробного периода: из базы, а у старых записей без даты — от регистрации. */
function trialEnd(c: CompanyRow) {
  if (c.trial_ends_at) return c.trial_ends_at;
  const start = Date.parse(c.created_at ?? "") || Date.now();
  return new Date(start + TRIAL_DAYS * 86_400_000).toISOString();
}

export function publicCompany(c: CompanyRow, plans: Plan[]): AuthCompany {
  const unlimited = c.unlimited === true;
  // До migration-multitenant.sql статуса trial нет: самостоятельная регистрация — pending.
  const trial = !unlimited && (c.status === "trial" || c.status === "pending");
  const ends = trial ? trialEnd(c) : null;
  const plan = unlimited ? null : findPlan(plans, c.plan);
  const used = Number(c.messages_used) || 0;
  const periodEnd = trial ? ends : unlimited ? null : c.period_end ?? null;
  const ai_blocked =
    plan && used >= plan.messages_limit ? "limit" : !trial && periodEnd && Date.parse(periodEnd) <= Date.now() ? "period" : null;
  return {
    id: c.id,
    name: c.name,
    status: !trial ? "active" : Date.parse(ends!) > Date.now() ? "trial" : "expired",
    trial_ends_at: ends,
    subdomain: c.subdomain ?? null,
    lead_kind: c.lead_kind === "cargo" ? "cargo" : "generic",
    telegram_leads: c.telegram_leads === true,
    unlimited,
    plan: plan ? { code: plan.code, name: plan.name, price: plan.price } : null,
    features: plan ? plan.features : ALL_FEATURES,
    usage: {
      messages_used: used,
      messages_limit: plan ? plan.messages_limit : null,
      period_end: periodEnd,
      users_limit: plan ? plan.users_included + (Number(c.extra_users) || 0) : null,
      instagram_accounts: plan ? plan.instagram_accounts : null,
    },
    ai_blocked,
  };
}

/** Компания для ответа API: статус, тариф, лимиты (тарифы — из таблицы plans, кэш 1 мин). */
export async function describeCompany(c: CompanyRow): Promise<AuthCompany> {
  return publicCompany(c, await getPlans());
}

/** Люди компании для экрана «Выберите менеджера». */
export async function companyUsers(companyId: string) {
  const { data, error } = await createAdminClient()
    .from("app_users")
    .select("id, name, role, sort_order")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; role: Role }[];
}

export async function findCompanyByLogin(login: string) {
  const { data } = await createAdminClient()
    .from("companies")
    .select("*")
    .eq("login", login.trim().toLowerCase())
    .maybeSingle();
  return (data as CompanyRow | null) ?? null;
}

export async function findUserByLogin(login: string) {
  const { data } = await createAdminClient()
    .from("app_users")
    .select("*")
    .eq("login", login.trim().toLowerCase())
    .maybeSingle();
  return (data as UserRow | null) ?? null;
}

export async function findUser(id: string) {
  return userById(id);
}

export async function findCompany(id: string) {
  return companyById(id);
}

// ---------------------------------------------------------------------
// Защита от перебора: 10 неудачных попыток за 15 минут на IP+логин
// ---------------------------------------------------------------------

const failures = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}

export function isLocked(key: string) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else f.count += 1;
  if (failures.size > 10_000) failures.clear();
}

export function clearFailures(key: string) {
  failures.delete(key);
}

/** Компания с вычисленным статусом пробного периода (кэш 30 с) — для вебхуков и фоновых задач. */
export async function companyInfo(id: string | null | undefined): Promise<AuthCompany | null> {
  if (!id) return null;
  const c = await companyById(id);
  return c ? describeCompany(c) : null;
}
