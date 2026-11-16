/**
 * Настройки компании (companies.settings, migration-deals.sql):
 *   deal       — блок сделки: включён ли, названия полей, список видов (у Radius — виды перевозки);
 *   deadlines  — сроки: не взята в работу, нет ставки, зависла;
 *   work       — рабочие дни и часы: напоминания приходят только в это время.
 * Всё, чего нет в базе, берётся из значений по умолчанию.
 */

export const CURRENCIES = ["USD", "UZS", "EUR", "RUB"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type DealSettings = {
  enabled: boolean;
  type_label: string;
  price_label: string;
  cost_label: string;
  types: string[];
  stage_label: string;
  offer_button: string;
};

export type CompanySettings = {
  deal: DealSettings;
  deadlines: { not_taken_minutes: number; no_offer_hours: number; stuck_days: number };
  work: { days: number[]; start: string; end: string; tz: string };
};

export const DEFAULT_SETTINGS: CompanySettings = {
  deal: {
    enabled: false,
    type_label: "Вид сделки",
    price_label: "Сумма сделки",
    cost_label: "Себестоимость",
    types: [],
    stage_label: "Предложение отправлено",
    offer_button: "Отправил предложение",
  },
  deadlines: { not_taken_minutes: 30, no_offer_hours: 24, stuck_days: 3 },
  work: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", tz: "Asia/Tashkent" },
};

const str = (v: unknown, fallback: string, max = 60) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return s || fallback;
};
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};
const time = (v: unknown, fallback: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback);

/** Настройки из базы (или из запроса) → полный проверенный объект. */
export function normalizeSettings(raw: any): CompanySettings {
  const d = DEFAULT_SETTINGS;
  const deal = raw?.deal ?? {};
  const dl = raw?.deadlines ?? {};
  const w = raw?.work ?? {};
  const types = Array.isArray(deal.types)
    ? [...new Set(deal.types.map((t: unknown) => str(t, "", 30)).filter(Boolean))].slice(0, 20)
    : d.deal.types;
  const days = Array.isArray(w.days) ? [...new Set(w.days.map(Number).filter((x: number) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : d.work.days;
  return {
    deal: {
      enabled: deal.enabled === true,
      type_label: str(deal.type_label, d.deal.type_label),
      price_label: str(deal.price_label, d.deal.price_label),
      cost_label: str(deal.cost_label, d.deal.cost_label),
      types: types as string[],
      stage_label: str(deal.stage_label, d.deal.stage_label),
      offer_button: str(deal.offer_button, d.deal.offer_button),
    },
    deadlines: {
      not_taken_minutes: num(dl.not_taken_minutes, d.deadlines.not_taken_minutes, 5, 24 * 60),
      no_offer_hours: num(dl.no_offer_hours, d.deadlines.no_offer_hours, 1, 24 * 14),
      stuck_days: num(dl.stuck_days, d.deadlines.stuck_days, 1, 60),
    },
    work: {
      days: (days as number[]).length ? (days as number[]) : d.work.days,
      start: time(w.start, d.work.start),
      end: time(w.end, d.work.end),
      tz: typeof w.tz === "string" && w.tz ? w.tz : d.work.tz,
    },
  };
}

// ---------------------------------------------------------------------
// Рабочее время компании
// ---------------------------------------------------------------------

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** День недели (0 — воскресенье), минута дня и дата YYYY-MM-DD в поясе компании. */
export function localParts(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday, minute: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

export function isWorkTime(date: Date, work: CompanySettings["work"]) {
  const p = localParts(date, work.tz);
  return work.days.includes(p.weekday) && p.minute >= toMin(work.start) && p.minute < toMin(work.end);
}

/**
 * Начало рабочего времени не раньше date: если date уже в рабочее время — сама date,
 * иначе — начало ближайшего рабочего дня (ночь и выходные пропускаются).
 */
export function workStartFrom(date: Date, work: CompanySettings["work"]): Date {
  if (isWorkTime(date, work)) return date;
  const start = toMin(work.start);
  for (let i = 0; i < 8; i++) {
    const probe = new Date(date.getTime() + i * 86_400_000);
    const p = localParts(probe, work.tz);
    if (!work.days.includes(p.weekday)) continue;
    // Сдвиг от probe до начала рабочего дня (минуты в поясе компании).
    const candidate = new Date(probe.getTime() + (start - p.minute) * 60_000);
    candidate.setSeconds(0, 0);
    if (candidate.getTime() >= date.getTime() - 60_000) return candidate;
  }
  return date;
}
