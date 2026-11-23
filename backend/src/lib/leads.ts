/**
 * Выборка заявок для страниц «Заявки» и «Статистика». Цена (quote_price)
 * намеренно не выбирается: менеджеры называют её клиенту сами.
 */

import { DEFAULT_SETTINGS, type CompanySettings } from "./company-settings";

/** Причины отказа: первые семь — список из ТЗ, остальные — прежние (остаются для старых заявок и статистики). */
export const LOST_REASONS = [
  "too_expensive",
  "no_response",
  "just_asking",
  "nothing_to_offer",
  "bad_timing",
  "chose_other",
  "other",
  "closed_themselves",
  "not_relevant",
  "duplicate_spam",
] as const;

const SELECT =
  "id, session_id, client_name, client_phone, collected_data, status, created_at, " +
  "manager_id, closed_at, closed_by, lost_reason, lost_comment, taken_by, taken_at, " +
  "assigned_at, offered_at, status_changed_at, deal_type, deal_price, deal_cost, deal_currency, " +
  "lost_price, lost_currency, next_contact_date, next_contact_note, " +
  "managers(id, name), chat_sessions(account_id, accounts(platform, account_name))";

const PAGE_SIZE = 1000; // Supabase не отдаёт больше 1000 строк за запрос

export const STATUS_GROUPS: Record<string, string[]> = {
  active: ["new", "in_progress", "offered"],
  offered: ["offered"],
  // «Просроченные» — активные, дальше отфильтровываются по срокам (overdue).
  overdue: ["in_progress", "offered"],
  sold: ["sold"],
  not_sold: ["not_sold"],
};

/** Менеджеру — только его заявки; без привязки к менеджеру — ни одной. Руководителю и супер-админу — все. */
export function ownManagerFilter(auth?: { role: string; manager_id: string | null }) {
  if (!auth || auth.role !== "manager") return undefined;
  return auth.manager_id ?? NO_LEADS;
}
const NO_LEADS = "00000000-0000-0000-0000-000000000000";

export type LeadFilters = {
  /** Компания: только её заявки. Обязательно. */
  company: string;
  /** active | sold | not_sold; не указан — все заявки */
  group?: string;
  /** id менеджера или "none" — без ответственного */
  manager?: string;
  /** id Instagram-аккаунта: только заявки этого аккаунта */
  account?: string;
  from?: string;
  to?: string;
  /** Только просроченные: нет ставки или зависли. */
  overdue?: boolean;
};

/**
 * Контроль сроков компании: null — модуль выключен (меток и напоминаний о сроках нет).
 * offer — в воронке есть этап «предложение» (только тогда бывает метка «Нет ставки/предложения»).
 */
export type LeadControl = { deadlines: CompanySettings["deadlines"]; offer: boolean } | null;
export function leadControl(s: CompanySettings): LeadControl {
  return s.modules.deadlines ? { deadlines: s.deadlines, offer: s.stages.offered !== null } : null;
}

/** Как показывать заявки: контроль сроков компании и видна ли маржа (только руководителю). */
export type LeadView = { control?: LeadControl; showMargin?: boolean };

/**
 * Метки контроля сроков:
 *   no_offer — «В работе» дольше no_offer_hours без ставки (если в воронке есть этап предложения);
 *   stuck    — открытая заявка в работе без смены статуса дольше stuck_days.
 */
export function overdueOf(lead: any, control: LeadControl | undefined, now = Date.now()) {
  if (!control) return { no_offer: false, stuck: false };
  const { deadlines } = control;
  const since = (iso: string | null | undefined) => (iso ? now - Date.parse(iso) : 0);
  const changed = lead.status_changed_at ?? lead.taken_at ?? lead.created_at;
  return {
    no_offer: control.offer && lead.status === "in_progress" && since(lead.taken_at ?? changed) >= deadlines.no_offer_hours * 3_600_000,
    stuck: (lead.status === "in_progress" || lead.status === "offered") && since(changed) >= deadlines.stuck_days * 86_400_000,
  };
}

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function flatten(row: any, view: LeadView = {}) {
  const { managers, chat_sessions, ...lead } = row;
  const account = chat_sessions?.accounts;
  const price = n(lead.deal_price);
  const cost = n(lead.deal_cost);
  return {
    ...lead,
    deal_price: price,
    deal_cost: cost,
    lost_price: n(lead.lost_price),
    // Маржа = ставка клиенту − ставка перевозчика. Видит только руководитель.
    margin: view.showMargin && price !== null && cost !== null ? Math.round((price - cost) * 100) / 100 : undefined,
    overdue: overdueOf(lead, view.control),
    manager: managers ?? null,
    // Аккаунт заявки: из переписки, у ручной заявки — тот, что был выбран при создании.
    account_id: (chat_sessions?.account_id ?? lead.collected_data?.account_id ?? null) as string | null,
    source: account ? { platform: account.platform, account_name: account.account_name } : null,
  };
}

/** Заявка компании; чужая — null. */
export async function fetchLead(supabase: any, id: string, company: string, view: LeadView = {}) {
  const { data, error } = await supabase.from("leads").select(SELECT).eq("id", id).eq("company_id", company).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? flatten(data, view) : null;
}

export async function fetchLeads(supabase: any, filters: LeadFilters, view: LeadView = {}) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let q = supabase
      .from("leads")
      .select(SELECT)
      .eq("company_id", filters.company)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.group) q = q.in("status", STATUS_GROUPS[filters.group]);
    if (filters.manager === "none") q = q.is("manager_id", null);
    else if (filters.manager) q = q.eq("manager_id", filters.manager);
    if (filters.from) q = q.gte("created_at", filters.from);
    if (filters.to) q = q.lte("created_at", filters.to);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  let leads = rows.map((r) => flatten(r, view));
  if (filters.overdue) leads = leads.filter((l) => l.overdue.no_offer || l.overdue.stuck);
  // Фильтр по аккаунту — здесь, а не в запросе: у ручных заявок аккаунт лежит в collected_data.
  return filters.account ? leads.filter((l) => l.account_id === filters.account) : leads;
}

// ---------------------------------------------------------------------
// Статистика
// ---------------------------------------------------------------------

type StatLead = {
  status: string;
  created_at: string;
  manager_id: string | null;
  lost_reason: string | null;
  collected_data: Record<string, string | undefined> | null;
  source: { platform: string } | null;
};

const MAX_CHART_DAYS = 366;

function percent(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Конверсия = продано / закрытые, в %. Закрытых нет — null, а не 0%. */
function conversion(sold: number, notSold: number) {
  const closed = sold + notSold;
  return closed ? Math.round((sold / closed) * 1000) / 10 : null;
}

function dayFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Все дни периода, включая дни без заявок: иначе на графике пропадают нули. */
function daysBetween(first: string, last: string) {
  const days: string[] = [];
  const end = Date.parse(`${last}T00:00:00Z`);
  let t = Date.parse(`${first}T00:00:00Z`);
  t = Math.max(t, end - (MAX_CHART_DAYS - 1) * 86_400_000);
  for (; t <= end; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export function buildLeadStats(
  leads: StatLead[],
  managers: { id: string; name: string; is_active: boolean }[],
  options: { from?: string; to?: string; timeZone: string }
) {
  const count = (status: string) => leads.filter((l) => l.status === status).length;
  const sold = count("sold");
  const notSold = count("not_sold");

  // Менеджеры: все активные (даже с нулём) и отключённые, если у них есть заявки за период.
  const byManager = managers
    .map((m) => {
      const own = leads.filter((l) => l.manager_id === m.id);
      const s = own.filter((l) => l.status === "sold").length;
      const n = own.filter((l) => l.status === "not_sold").length;
      return { id: m.id as string | null, name: m.name, is_active: m.is_active, received: own.length, sold: s, not_sold: n, conversion: conversion(s, n) };
    })
    .filter((m) => m.is_active || m.received > 0);

  const unassigned = leads.filter((l) => !l.manager_id);
  if (unassigned.length) {
    const s = unassigned.filter((l) => l.status === "sold").length;
    const n = unassigned.filter((l) => l.status === "not_sold").length;
    byManager.push({ id: null, name: "Без ответственного", is_active: true, received: unassigned.length, sold: s, not_sold: n, conversion: conversion(s, n) });
  }

  // Причины: стандартные и все, что встречаются в заявках (свои причины компании).
  const reasonCodes = [...new Set<string>([...LOST_REASONS, ...leads.filter((l) => l.status === "not_sold" && l.lost_reason).map((l) => l.lost_reason as string)])];
  const reasons = reasonCodes.map((reason) => {
    const c = leads.filter((l) => l.status === "not_sold" && l.lost_reason === reason).length;
    return { reason, count: c, percent: percent(c, notSold) };
  }).sort((a, b) => b.count - a.count);

  const sources = ["instagram", "telegram"].map((platform) => {
    const c = leads.filter((l) => l.source?.platform === platform).length;
    return { platform, count: c, percent: percent(c, leads.length) };
  });

  // Направления: «Ташкент» и «ташкент» — одно и то же; показываем первое написание.
  const routes = new Map<string, { route: string; count: number }>();
  for (const l of leads) {
    const origin = l.collected_data?.origin_city?.trim();
    const destination = l.collected_data?.destination_city?.trim();
    if (!origin || !destination) continue;
    const route = `${origin} → ${destination}`;
    const entry = routes.get(route.toLowerCase()) ?? { route, count: 0 };
    entry.count += 1;
    routes.set(route.toLowerCase(), entry);
  }

  const fmt = dayFormatter(options.timeZone);
  // По дням: сколько пришло и чем закончились (открытые = новые + в работе).
  const perDay = new Map<string, { count: number; open: number; sold: number; not_sold: number }>();
  for (const l of leads) {
    const day = fmt.format(new Date(l.created_at));
    const d = perDay.get(day) ?? { count: 0, open: 0, sold: 0, not_sold: 0 };
    d.count += 1;
    if (l.status === "sold") d.sold += 1;
    else if (l.status === "not_sold") d.not_sold += 1;
    else d.open += 1;
    perDay.set(day, d);
  }
  const known = [...perDay.keys()].sort();
  const firstDay = options.from ? fmt.format(new Date(options.from)) : known[0];
  const lastDay = options.to ? fmt.format(new Date(options.to)) : fmt.format(new Date());
  const daily = firstDay
    ? daysBetween(firstDay, lastDay).map((date) => ({ date, ...(perDay.get(date) ?? { count: 0, open: 0, sold: 0, not_sold: 0 }) }))
    : [];

  return {
    totals: {
      total: leads.length,
      new: count("new"),
      in_progress: count("in_progress"),
      offered: count("offered"),
      sold,
      not_sold: notSold,
      conversion: conversion(sold, notSold),
    },
    managers: byManager,
    reasons,
    sources,
    routes: [...routes.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    daily,
  };
}

// ---------------------------------------------------------------------
// Контроль работы с заявками: по логистам и по направлениям (ТЗ 16.11.2026)
// ---------------------------------------------------------------------

type WorkLead = {
  status: string;
  created_at: string;
  manager_id: string | null;
  assigned_at?: string | null;
  taken_at?: string | null;
  offered_at?: string | null;
  status_changed_at?: string | null;
  deal_price?: number | null;
  deal_cost?: number | null;
  deal_currency?: string | null;
  lost_reason?: string | null;
  lost_price?: number | null;
  lost_currency?: string | null;
  collected_data: Record<string, string | undefined> | null;
};

const minutesBetween = (a?: string | null, b?: string | null) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 60_000) : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** Маржа по валютам, без конвертации: { USD: { sum, avg, count } }. */
function marginByCurrency(leads: WorkLead[]) {
  const out: Record<string, { sum: number; avg: number; count: number }> = {};
  for (const l of leads) {
    if (l.deal_price == null || l.deal_cost == null || !l.deal_currency) continue;
    const m = (out[l.deal_currency] ??= { sum: 0, avg: 0, count: 0 });
    m.sum += l.deal_price - l.deal_cost;
    m.count += 1;
  }
  for (const m of Object.values(out)) {
    m.sum = Math.round(m.sum * 100) / 100;
    m.avg = Math.round((m.sum / m.count) * 100) / 100;
  }
  return out;
}

function reasonCounts(leads: WorkLead[]) {
  const out: Record<string, number> = {};
  for (const l of leads) if (l.status === "not_sold" && l.lost_reason) out[l.lost_reason] = (out[l.lost_reason] ?? 0) + 1;
  return out;
}

function workRow(leads: WorkLead[], control: LeadControl, showMargin: boolean) {
  const taken = leads.filter((l) => l.taken_at);
  const offered = leads.filter((l) => l.offered_at);
  const sold = leads.filter((l) => l.status === "sold");
  const overdue = leads.map((l) => overdueOf(l, control));
  return {
    leads: leads.length,
    taken: taken.length,
    avg_take_minutes: avg(taken.map((l) => minutesBetween(l.assigned_at ?? l.created_at, l.taken_at)).filter((x): x is number => x !== null)),
    avg_offer_minutes: avg(offered.map((l) => minutesBetween(l.taken_at, l.offered_at)).filter((x): x is number => x !== null)),
    offer_percent: pct(offered.length, taken.length),
    funnel: { leads: leads.length, offered: offered.length, sold: sold.length },
    sold: sold.length,
    // Маржа — только руководителю.
    margin: showMargin ? marginByCurrency(sold) : undefined,
    lost: reasonCounts(leads),
    overdue: { no_offer: overdue.filter((o) => o.no_offer).length, stuck: overdue.filter((o) => o.stuck).length },
  };
}

export function buildWorkStats(
  leads: WorkLead[],
  managers: { id: string; name: string; is_active: boolean }[],
  options: { control?: LeadControl; showMargin: boolean }
) {
  const control = options.control ?? null;
  const logists = managers
    .map((m) => ({ id: m.id as string | null, name: m.name, ...workRow(leads.filter((l) => l.manager_id === m.id), control, options.showMargin) }))
    .filter((r) => r.leads > 0 || managers.find((m) => m.id === r.id)?.is_active);

  // Направления: «Ташкент» и «ташкент» — одно и то же.
  const byRoute = new Map<string, { route: string; leads: WorkLead[] }>();
  for (const l of leads) {
    const o = l.collected_data?.origin_city?.trim();
    const d = l.collected_data?.destination_city?.trim();
    if (!o || !d) continue;
    const key = `${o} → ${d}`.toLowerCase();
    const entry = byRoute.get(key) ?? { route: `${o} → ${d}`, leads: [] };
    entry.leads.push(l);
    byRoute.set(key, entry);
  }
  const routes = [...byRoute.values()]
    .map(({ route, leads: rl }) => {
      const offered = rl.filter((l) => l.offered_at).length;
      const sold = rl.filter((l) => l.status === "sold").length;
      const reasons = Object.entries(reasonCounts(rl)).sort((a, b) => b[1] - a[1]);
      // «Дорого»: средняя наша ставка клиенту против средней цены клиента/конкурента — по валютам.
      const expensive = rl.filter((l) => l.status === "not_sold" && l.lost_reason === "too_expensive");
      const currencies = new Set(expensive.flatMap((l) => [l.deal_currency, l.lost_currency]).filter(Boolean) as string[]);
      const too_expensive = [...currencies].map((c) => ({
        currency: c,
        our_avg: avg(expensive.filter((l) => l.deal_currency === c && l.deal_price != null).map((l) => l.deal_price as number)),
        client_avg: avg(expensive.filter((l) => l.lost_currency === c && l.lost_price != null).map((l) => l.lost_price as number)),
      }));
      return { route, leads: rl.length, offered, sold, conversion: pct(sold, rl.length), top_reason: reasons[0]?.[0] ?? null, too_expensive };
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 30);

  return { logists, routes };
}
