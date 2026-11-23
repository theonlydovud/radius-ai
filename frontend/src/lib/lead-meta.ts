import type { Currency, LeadStatus, LostReason } from "@/types";
import { t } from "@/lib/i18n";

/**
 * Воронка и подписи текущей компании. Их выставляет CurrentUserProvider после входа
 * (setCompanySettings): этапы и их названия, причины отказа, термины («Заявка» / «Заказ»…),
 * названия блока сделки. Стандартные тексты переводятся, свои — показываются как написаны.
 */

export type DealSettings = {
  enabled: boolean;
  type_label: string;
  price_label: string;
  cost_label: string;
  types: string[];
  stage_label: string;
  offer_button: string;
};

export type Template = "goods" | "courses" | "services" | "b2b";
export type StageType = "open" | "success" | "fail";
export type Stages = { new: string; in_progress: string | null; offered: string | null; sold: string; not_sold: string };
export type Terms = {
  lead: "request" | "lead" | "booking" | "order";
  manager: "manager" | "logist" | "master";
  amount: "amount" | "rate";
};

export type CompanySettings = {
  deal: DealSettings;
  deadlines: { not_taken_minutes: number; no_offer_hours: number; stuck_days: number };
  work: { days: number[]; start: string; end: string; tz: string };
  template?: Template | null;
  stages?: Stages;
  lost_reasons?: string[];
  terms?: Terms;
  modules?: { deadlines: boolean; partners: boolean };
};

export const DEFAULT_DEAL: DealSettings = {
  enabled: false,
  type_label: "Вид сделки",
  price_label: "Сумма сделки",
  cost_label: "Себестоимость",
  types: [],
  stage_label: "Предложение отправлено",
  offer_button: "Отправил предложение",
};

const DEFAULT_STAGES: Stages = { new: "Новая", in_progress: "В работе", offered: "Предложение отправлено", sold: "Продано", not_sold: "Не продано" };
const DEFAULT_TERMS: Terms = { lead: "request", manager: "manager", amount: "amount" };
const DEFAULT_REASONS = ["too_expensive", "no_response", "just_asking", "bad_timing", "chose_other", "other"];

export const STAGE_KEYS: LeadStatus[] = ["new", "in_progress", "offered", "sold", "not_sold"];
export const STAGE_TYPE: Record<LeadStatus, StageType> = { new: "open", in_progress: "open", offered: "open", sold: "success", not_sold: "fail" };

let current: CompanySettings | undefined;

/** Настройки текущей компании (после входа). */
export function setCompanySettings(next: CompanySettings | undefined) {
  current = next;
}
/** @deprecated старое имя — то же, что setCompanySettings. */
export const setDealLabels = (next: CompanySettings["deal"] | CompanySettings | undefined) =>
  setCompanySettings(next && "deadlines" in next ? next : next ? ({ ...(current ?? {}), deal: next } as CompanySettings) : undefined);

const deal = () => current?.deal ?? DEFAULT_DEAL;
const stages = (): Stages => current?.stages ?? { ...DEFAULT_STAGES, offered: deal().stage_label || DEFAULT_STAGES.offered };
export function dealLabels() {
  return deal();
}
export function companyTerms(): Terms {
  return current?.terms ?? DEFAULT_TERMS;
}
export function companyTemplate(): Template | null {
  return current?.template ?? null;
}

/** Подпись из настроек: если для неё есть перевод (стандартные и шаблонные) — переводится, своя — как написана. */
const label = (value: string) => t(value);

/** Есть ли этап в воронке компании. */
export function hasStage(key: LeadStatus) {
  return stages()[key] !== null;
}

/** Этапы компании по порядку (только существующие). */
export function stageList(): { key: LeadStatus; label: string; type: StageType }[] {
  const s = stages();
  return STAGE_KEYS.filter((k) => s[k] !== null).map((k) => ({ key: k, label: label(s[k] as string), type: STAGE_TYPE[k] }));
}

/** Название этапа. У старых заявок в этапе, которого больше нет в шаблоне, — стандартное название. */
function stageLabel(key: LeadStatus) {
  return label(stages()[key] ?? (key === "offered" ? deal().stage_label : DEFAULT_STAGES[key]) ?? key);
}

/**
 * Какие кнопки показывать у открытой заявки:
 *   take  — перевести в «В работе» / этап шаблона («Консультация», «Записан»).
 *           «Взять в работу» — шаг для команды: у одного сотрудника его нет, этап «В работе» необязателен;
 *   offer — «Предложил ставку / Отправил предложение» (если в воронке есть этап предложения);
 *   reopenTo — куда возвращать закрытую заявку.
 */
export function leadFlow(status: LeadStatus, solo: boolean) {
  const s = stages();
  const takeIsWork = s.in_progress === DEFAULT_STAGES.in_progress;
  const take = status === "new" && s.in_progress !== null && !(solo && takeIsWork);
  return {
    take,
    takeLabel: takeIsWork ? t("Взять в работу") : `→ ${stageLabel("in_progress")}`,
    offer: s.offered !== null && (status === "in_progress" || (status === "new" && !take)),
    reopenTo: (s.in_progress !== null ? "in_progress" : "new") as LeadStatus,
    reopenLabel: s.in_progress !== null ? t("Вернуть в работу") : t("Вернуть"),
  };
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  get new() { return stageLabel("new"); },
  get in_progress() { return stageLabel("in_progress"); },
  get offered() { return stageLabel("offered"); },
  get sold() { return stageLabel("sold"); },
  get not_sold() { return stageLabel("not_sold"); },
};

export function offerButtonLabel() {
  return label(deal().offer_button);
}
export function priceLabel() {
  return label(deal().price_label);
}
export function costLabel() {
  return label(deal().cost_label);
}
export function typeLabel() {
  return label(deal().type_label);
}

export const STATUS_VARIANT: Record<LeadStatus, "warning" | "accent" | "success" | "danger"> = {
  new: "warning",
  in_progress: "accent",
  offered: "accent",
  sold: "success",
  not_sold: "danger",
};

export const CURRENCIES: Currency[] = ["USD", "UZS", "EUR", "RUB"];

// ---------------------------------------------------------------------
// Причины отказа
// ---------------------------------------------------------------------

export const CUSTOM_REASON_PREFIX = "custom:";

const REASON_TEXT: Record<string, string> = {
  too_expensive: "Дорого",
  no_response: "Не отвечает",
  just_asking: "Просто узнавал, заказа нет",
  nothing_to_offer: "Не наше направление или груз",
  bad_timing: "Не устроил срок",
  chose_other: "Выбрал другого",
  out_of_stock: "Нет в наличии",
  changed_mind: "Передумал",
  inconvenient_time: "Не подходит время",
  no_show: "Не пришёл",
  cancelled: "Отменил",
  other: "Другое",
  // прежние — у старых заявок и в статистике
  closed_themselves: "Сами закрыли",
  not_relevant: "Неактуальная заявка",
  duplicate_spam: "Дубль/спам",
};

/** Встроенные причины, которые можно добавить в список компании. */
export const BUILTIN_REASONS = [
  "too_expensive", "no_response", "just_asking", "nothing_to_offer", "bad_timing", "chose_other",
  "out_of_stock", "changed_mind", "inconvenient_time", "no_show", "cancelled", "other",
] as const;

export function lostReasonLabel(reason: LostReason | string | null | undefined) {
  if (!reason) return "—";
  if (reason.startsWith(CUSTOM_REASON_PREFIX)) return reason.slice(CUSTOM_REASON_PREFIX.length);
  return REASON_TEXT[reason] ? t(REASON_TEXT[reason]) : reason;
}

/** Причины, которые предлагаются при закрытии «не продано» — список компании. */
export function lostReasonOptions(): { value: LostReason; label: string }[] {
  const list = current?.lost_reasons ?? DEFAULT_REASONS;
  return list.map((value) => ({ value: value as LostReason, label: lostReasonLabel(value) }));
}

/** @deprecated список компании — lostReasonOptions(). Оставлен для старого кода. */
export const LOST_REASONS = {
  map<T>(fn: (r: { value: LostReason; label: string }, i: number) => T) {
    return lostReasonOptions().map(fn);
  },
  find(fn: (r: { value: LostReason; label: string }) => boolean) {
    return lostReasonOptions().find(fn);
  },
};

// ---------------------------------------------------------------------
// Термины: как называть заявку, сотрудника, сумму
// ---------------------------------------------------------------------

const LEAD_WORDS: Record<Terms["lead"], { one: string; many: string; newOne: string; acc: string }> = {
  request: { one: "Заявка", many: "Заявки", newOne: "Новая заявка", acc: "заявку" },
  lead: { one: "Лид", many: "Лиды", newOne: "Новый лид", acc: "лид" },
  booking: { one: "Запись", many: "Записи", newOne: "Новая запись", acc: "запись" },
  order: { one: "Заказ", many: "Заказы", newOne: "Новый заказ", acc: "заказ" },
};
const MANAGER_WORDS: Record<Terms["manager"], { one: string; many: string }> = {
  manager: { one: "Менеджер", many: "Менеджеры" },
  logist: { one: "Логист", many: "Логисты" },
  master: { one: "Мастер", many: "Мастера" },
};
const AMOUNT_WORDS: Record<Terms["amount"], string> = { amount: "Сумма", rate: "Ставка" };

/** «Заявки» / «Заказы» / «Записи» / «Лиды» — заголовки и меню. */
export const leadsTitle = () => t(LEAD_WORDS[companyTerms().lead].many);
/** «Заявка» / «Заказ»… */
export const leadOne = () => t(LEAD_WORDS[companyTerms().lead].one);
/** «Новая заявка» / «Новый заказ»… */
export const newLeadLabel = () => t(LEAD_WORDS[companyTerms().lead].newOne);
/** «Менеджер» / «Логист» / «Мастер». */
export const managerOne = () => t(MANAGER_WORDS[companyTerms().manager].one);
/** «Менеджеры» / «Логисты» / «Мастера». */
export const managersTitle = () => t(MANAGER_WORDS[companyTerms().manager].many);
/** «Сумма» / «Ставка». */
export const amountWord = () => t(AMOUNT_WORDS[companyTerms().amount]);

/** Варианты терминов для настроек. */
export const TERM_CHOICES = {
  lead: (Object.keys(LEAD_WORDS) as Terms["lead"][]).map((v) => ({ value: v, get label() { return t(LEAD_WORDS[v].one); } })),
  manager: (Object.keys(MANAGER_WORDS) as Terms["manager"][]).map((v) => ({ value: v, get label() { return t(MANAGER_WORDS[v].one); } })),
  amount: (Object.keys(AMOUNT_WORDS) as Terms["amount"][]).map((v) => ({ value: v, get label() { return t(AMOUNT_WORDS[v]); } })),
};

/** Шаблоны бизнеса для мастера «Кто вы?» и настроек. */
export const TEMPLATE_CHOICES: { value: Template; title: string; hint: string; stages: string[] }[] = [
  {
    value: "goods",
    get title() { return t("Товары"); },
    get hint() { return t("Магазин, блогер — продаёте товары"); },
    get stages() { return [t("Новый"), t("Продано"), t("Не продано")]; },
  },
  {
    value: "courses",
    get title() { return t("Курсы"); },
    get hint() { return t("Обучение, курсы, консультации"); },
    get stages() { return [t("Новый"), t("Консультация"), t("Продано"), t("Не продано")]; },
  },
  {
    value: "services",
    get title() { return t("Услуги по записи"); },
    get hint() { return t("Салон, клиника, мастер — клиенты записываются"); },
    get stages() { return [t("Новый"), t("Записан"), t("Пришёл"), t("Не пришёл")]; },
  },
  {
    value: "b2b",
    get title() { return t("B2B с расчётом"); },
    get hint() { return t("Считаете цену под каждую заявку: логистика, производство, опт"); },
    get stages() { return [t("Новая"), t("В работе"), t("Ставка предложена"), t("Продано"), t("Не продано")]; },
  },
];

/** «12 500 USD» */
export function money(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)}${currency ? ` ${currency}` : ""}`;
}
