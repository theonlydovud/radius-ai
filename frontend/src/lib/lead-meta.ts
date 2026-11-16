import type { Currency, LeadStatus, LostReason } from "@/types";
import { t } from "@/lib/i18n";

/**
 * Подписи этапов и причин. Названия блока сделки у каждой компании свои (Настройки):
 * у Radius — «Ставка предложена», «Ставка клиенту»…, у остальных — «Предложение отправлено»,
 * «Сумма сделки»… Их выставляет CurrentUserProvider после входа (setDealLabels).
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

export type CompanySettings = {
  deal: DealSettings;
  deadlines: { not_taken_minutes: number; no_offer_hours: number; stuck_days: number };
  work: { days: number[]; start: string; end: string; tz: string };
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

let deal: DealSettings = DEFAULT_DEAL;
/** Названия блока сделки текущей компании (тексты из настроек не переводятся — их пишет компания). */
export function setDealLabels(next: DealSettings | undefined) {
  deal = next ?? DEFAULT_DEAL;
}
export function dealLabels() {
  return deal;
}
/** Подпись из настроек: если для неё есть перевод (стандартные и Radius) — переводится, своя — как написана. */
const label = (value: string, _fallback: string) => t(value);

export const STATUS_LABEL: Record<LeadStatus, string> = {
  get new() { return t("Новая"); },
  get in_progress() { return t("В работе"); },
  get offered() { return label(deal.stage_label, DEFAULT_DEAL.stage_label); },
  get sold() { return t("Продано"); },
  get not_sold() { return t("Не продано"); },
};

export function offerButtonLabel() {
  return label(deal.offer_button, DEFAULT_DEAL.offer_button);
}
export function priceLabel() {
  return label(deal.price_label, DEFAULT_DEAL.price_label);
}
export function costLabel() {
  return label(deal.cost_label, DEFAULT_DEAL.cost_label);
}
export function typeLabel() {
  return label(deal.type_label, DEFAULT_DEAL.type_label);
}

export const STATUS_VARIANT: Record<LeadStatus, "warning" | "accent" | "success" | "danger"> = {
  new: "warning",
  in_progress: "accent",
  offered: "accent",
  sold: "success",
  not_sold: "danger",
};

export const CURRENCIES: Currency[] = ["USD", "UZS", "EUR", "RUB"];

/** Причины, которые предлагаются при закрытии (ТЗ). */
export const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "too_expensive", get label() { return t("Дорого"); } },
  { value: "no_response", get label() { return t("Не отвечает"); } },
  { value: "just_asking", get label() { return t("Просто узнавал, заказа нет"); } },
  { value: "nothing_to_offer", get label() { return t("Не наше направление или груз"); } },
  { value: "bad_timing", get label() { return t("Не устроил срок"); } },
  { value: "chose_other", get label() { return t("Выбрал другого"); } },
  { value: "other", get label() { return t("Другое"); } },
];

/** Прежние причины — остались у старых заявок и в статистике. */
const LEGACY_REASONS: { value: LostReason; label: string }[] = [
  { value: "closed_themselves", get label() { return t("Сами закрыли"); } },
  { value: "not_relevant", get label() { return t("Неактуальная заявка"); } },
  { value: "duplicate_spam", get label() { return t("Дубль/спам"); } },
];

export function lostReasonLabel(reason: LostReason | null) {
  return [...LOST_REASONS, ...LEGACY_REASONS].find((r) => r.value === reason)?.label ?? "—";
}

/** «12 500 USD» */
export function money(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)}${currency ? ` ${currency}` : ""}`;
}
