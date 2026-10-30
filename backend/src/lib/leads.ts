/**
 * Выборка заявок для страниц «Заявки» и «Статистика». Цена (quote_price)
 * намеренно не выбирается: менеджеры называют её клиенту сами.
 */

export const LOST_REASONS = [
  "too_expensive",
  "closed_themselves",
  "nothing_to_offer",
  "not_relevant",
  "no_response",
  "duplicate_spam",
] as const;

const SELECT =
  "id, session_id, client_name, client_phone, collected_data, status, created_at, " +
  "manager_id, closed_at, closed_by, lost_reason, lost_comment, " +
  "managers(id, name), chat_sessions(accounts(platform, account_name))";

const PAGE_SIZE = 1000; // Supabase не отдаёт больше 1000 строк за запрос

export const STATUS_GROUPS: Record<string, string[]> = {
  active: ["new", "in_progress"],
  sold: ["sold"],
  not_sold: ["not_sold"],
};

export type LeadFilters = {
  /** active | sold | not_sold; не указан — все заявки */
  group?: string;
  /** id менеджера или "none" — без ответственного */
  manager?: string;
  from?: string;
  to?: string;
};

function flatten(row: any) {
  const { managers, chat_sessions, ...lead } = row;
  const account = chat_sessions?.accounts;
  return {
    ...lead,
    manager: managers ?? null,
    source: account ? { platform: account.platform, account_name: account.account_name } : null,
  };
}

export async function fetchLead(supabase: any, id: string) {
  const { data, error } = await supabase.from("leads").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? flatten(data) : null;
}

export async function fetchLeads(supabase: any, filters: LeadFilters) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let q = supabase
      .from("leads")
      .select(SELECT)
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
  return rows.map(flatten);
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

  const reasons = LOST_REASONS.map((reason) => {
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
  const perDay = new Map<string, number>();
  for (const l of leads) {
    const day = fmt.format(new Date(l.created_at));
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const known = [...perDay.keys()].sort();
  const firstDay = options.from ? fmt.format(new Date(options.from)) : known[0];
  const lastDay = options.to ? fmt.format(new Date(options.to)) : fmt.format(new Date());
  const daily = firstDay ? daysBetween(firstDay, lastDay).map((date) => ({ date, count: perDay.get(date) ?? 0 })) : [];

  return {
    totals: {
      total: leads.length,
      new: count("new"),
      in_progress: count("in_progress"),
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
