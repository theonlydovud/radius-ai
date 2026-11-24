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

// ---------------------------------------------------------------------
// Воронка: шаблоны бизнеса, этапы с типами, причины отказа, термины, модули
// ---------------------------------------------------------------------

/** Шаблоны бизнеса (мастер «Кто вы?»). null — шаблон ещё не выбран. */
export const TEMPLATES = ["goods", "courses", "services", "b2b"] as const;
export type Template = (typeof TEMPLATES)[number];

/**
 * Этапы — постоянные «слоты» (коды статусов в базе). Шаблон решает, какие из них есть у компании
 * и как называются. Статистика и конверсия считаются по типу этапа, поэтому переименование ничего не ломает.
 */
export const STAGE_KEYS = ["new", "in_progress", "offered", "sold", "not_sold"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type StageType = "open" | "success" | "fail";
export const STAGE_TYPE: Record<StageKey, StageType> = { new: "open", in_progress: "open", offered: "open", sold: "success", not_sold: "fail" };
/** Названия этапов; null — этапа у компании нет. Новый, успех и отказ есть всегда. */
export type Stages = { new: string; in_progress: string | null; offered: string | null; sold: string; not_sold: string };

/** Причины отказа: встроенные коды (переводятся в интерфейсе) и свои — «custom:Текст». */
export const BUILTIN_LOST_REASONS = [
  "too_expensive", "no_response", "just_asking", "nothing_to_offer", "bad_timing", "chose_other",
  "out_of_stock", "changed_mind", "inconvenient_time", "no_show", "cancelled", "other",
  // прежние — остаются у старых заявок
  "closed_themselves", "not_relevant", "duplicate_spam",
] as const;
export const CUSTOM_REASON_PREFIX = "custom:";

/** Термины интерфейса: как называть заявку, сотрудника и сумму. */
export const TERM_OPTIONS = {
  lead: ["request", "lead", "booking", "order"],
  manager: ["manager", "logist", "master"],
  amount: ["amount", "rate"],
} as const;
export type Terms = { lead: (typeof TERM_OPTIONS.lead)[number]; manager: (typeof TERM_OPTIONS.manager)[number]; amount: (typeof TERM_OPTIONS.amount)[number] };

/** Модули, которые включает руководитель. «Ответственные» включаются сами при 2+ сотрудниках, уведомления есть всегда. */
export type Modules = { deadlines: boolean; partners: boolean };

type TemplatePreset = { stages: Stages; lost_reasons: string[]; terms: Terms; deal: boolean };

export const TEMPLATE_PRESETS: Record<Template, TemplatePreset> = {
  goods: {
    stages: { new: "Новый", in_progress: null, offered: null, sold: "Продано", not_sold: "Не продано" },
    lost_reasons: ["too_expensive", "out_of_stock", "no_response", "changed_mind", "other"],
    terms: { lead: "order", manager: "manager", amount: "amount" },
    deal: false,
  },
  courses: {
    stages: { new: "Новый", in_progress: "Консультация", offered: null, sold: "Продано", not_sold: "Не продано" },
    lost_reasons: ["too_expensive", "inconvenient_time", "no_response", "changed_mind", "other"],
    terms: { lead: "request", manager: "manager", amount: "amount" },
    deal: false,
  },
  services: {
    stages: { new: "Новый", in_progress: "Записан", offered: null, sold: "Пришёл", not_sold: "Не пришёл" },
    lost_reasons: ["no_show", "cancelled", "too_expensive", "no_response", "other"],
    // «Услуги» шире записи к мастеру (ремонт, доставка, клиника) — нейтральные термины, их можно сменить.
    terms: { lead: "request", manager: "manager", amount: "amount" },
    deal: false,
  },
  b2b: {
    stages: { new: "Новая", in_progress: "В работе", offered: "Ставка предложена", sold: "Продано", not_sold: "Не продано" },
    lost_reasons: ["too_expensive", "no_response", "just_asking", "nothing_to_offer", "bad_timing", "chose_other", "other"],
    terms: { lead: "request", manager: "logist", amount: "rate" },
    deal: true,
  },
};

/** Без шаблона — нейтральная воронка, как была до шаблонов. */
const DEFAULT_STAGES: Stages = { new: "Новая", in_progress: "В работе", offered: "Предложение отправлено", sold: "Продано", not_sold: "Не продано" };
const DEFAULT_LOST_REASONS = ["too_expensive", "no_response", "just_asking", "bad_timing", "chose_other", "other"];
const DEFAULT_TERMS: Terms = { lead: "request", manager: "manager", amount: "amount" };

export type CompanySettings = {
  deal: DealSettings;
  deadlines: { not_taken_minutes: number; no_offer_hours: number; stuck_days: number };
  work: { days: number[]; start: string; end: string; tz: string };
  template: Template | null;
  stages: Stages;
  lost_reasons: string[];
  terms: Terms;
  modules: Modules;
  /** Модуль «Партнёры»: как называть не-клиентов, которых распознаёт бот (у Radius — «Водитель»). */
  partners: { label: string; label_many: string };
};

/**
 * Слово «заявка» по терминам компании — для Telegram-сообщений на русском:
 * one «заявка», acc «заявку», dat «заявке», New «Новая заявка», a — окончание прошедшего времени («взята»).
 */
export function leadWordsRu(terms: Terms) {
  const [one, acc, dat, fem] = ({
    request: ["заявка", "заявку", "заявке", true],
    lead: ["лид", "лид", "лиду", false],
    booking: ["запись", "запись", "записи", true],
    order: ["заказ", "заказ", "заказу", false],
  } as const)[terms.lead];
  return { one, One: one[0].toUpperCase() + one.slice(1), acc, dat, New: `${fem ? "Новая" : "Новый"} ${one}`, a: fem ? "а" : "" };
}

/** Этапы компании по порядку, только существующие. */
export function stageList(s: Pick<CompanySettings, "stages">) {
  return STAGE_KEYS.filter((k) => s.stages[k] !== null).map((k) => ({ key: k, label: s.stages[k] as string, type: STAGE_TYPE[k] }));
}

export function hasStage(s: Pick<CompanySettings, "stages">, key: string): key is StageKey {
  return (STAGE_KEYS as readonly string[]).includes(key) && s.stages[key as StageKey] !== null;
}

export function isValidLostReason(code: unknown): code is string {
  if (typeof code !== "string") return false;
  if ((BUILTIN_LOST_REASONS as readonly string[]).includes(code)) return true;
  return code.startsWith(CUSTOM_REASON_PREFIX) && code.length > CUSTOM_REASON_PREFIX.length && code.length <= CUSTOM_REASON_PREFIX.length + 60;
}

/**
 * Применить шаблон: этапы, причины, термины и блок сделки из шаблона.
 * Сроки, рабочее время и названия полей сделки остаются как были.
 */
export function applyTemplate(current: CompanySettings, template: Template): CompanySettings {
  const p = TEMPLATE_PRESETS[template];
  return {
    ...current,
    template,
    stages: { ...p.stages },
    lost_reasons: [...p.lost_reasons],
    terms: { ...p.terms },
    deal: { ...current.deal, enabled: p.deal ? current.deal.enabled || p.deal : false },
  };
}

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
  template: null,
  stages: DEFAULT_STAGES,
  lost_reasons: DEFAULT_LOST_REASONS,
  terms: DEFAULT_TERMS,
  modules: { deadlines: false, partners: false },
  partners: { label: "Партнёр", label_many: "Партнёры" },
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

  const template: Template | null = (TEMPLATES as readonly string[]).includes(raw?.template) ? raw.template : null;
  // Этапы: из базы, иначе из шаблона, иначе нейтральные. Название «предложения» у старых компаний — из блока сделки.
  const baseStages: Stages = template ? TEMPLATE_PRESETS[template].stages : { ...DEFAULT_STAGES, offered: str(deal.stage_label, DEFAULT_STAGES.offered as string) };
  const rs = raw?.stages ?? {};
  const stageName = (k: StageKey) => {
    if (rs[k] === null && (k === "in_progress" || k === "offered")) return null;
    if (rs[k] === undefined) return baseStages[k];
    return str(rs[k], baseStages[k] ?? DEFAULT_STAGES[k] ?? "", 40);
  };
  const stages: Stages = {
    new: stageName("new") as string,
    in_progress: stageName("in_progress"),
    offered: stageName("offered"),
    sold: stageName("sold") as string,
    not_sold: stageName("not_sold") as string,
  };

  const reasonsBase = template ? TEMPLATE_PRESETS[template].lost_reasons : DEFAULT_LOST_REASONS;
  let lost_reasons = Array.isArray(raw?.lost_reasons)
    ? [...new Set(raw.lost_reasons.map((r: unknown) => (typeof r === "string" ? r.replace(/\s+/g, " ").trim() : "")).filter(isValidLostReason))].slice(0, 15) as string[]
    : reasonsBase;
  // «Другое» есть всегда: по нему пишут комментарий.
  if (!lost_reasons.includes("other")) lost_reasons = [...lost_reasons, "other"];

  const termsBase = template ? TEMPLATE_PRESETS[template].terms : DEFAULT_TERMS;
  const rt = raw?.terms ?? {};
  const pickTerm = <K extends keyof Terms>(k: K): Terms[K] =>
    ((TERM_OPTIONS[k] as readonly string[]).includes(rt[k]) ? rt[k] : termsBase[k]) as Terms[K];
  const terms: Terms = { lead: pickTerm("lead"), manager: pickTerm("manager"), amount: pickTerm("amount") };

  const rm = raw?.modules ?? {};
  // Контроль сроков раньше работал у всех, где были менеджеры: у старых компаний без явного выбора он включён.
  const modules: Modules = { deadlines: rm.deadlines === undefined ? raw?.deadlines !== undefined : rm.deadlines === true, partners: rm.partners === true };

  return {
    template,
    stages,
    lost_reasons,
    terms,
    modules,
    partners: {
      label: str(raw?.partners?.label, "Партнёр", 30),
      label_many: str(raw?.partners?.label_many, str(raw?.partners?.label, "Партнёр", 30) === "Партнёр" ? "Партнёры" : str(raw?.partners?.label, "Партнёр", 30), 30),
    },
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
