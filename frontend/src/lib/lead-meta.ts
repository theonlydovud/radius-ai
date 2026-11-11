import type { LeadStatus, LostReason } from "@/types";
import { t } from "@/lib/i18n";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  get new() { return t("Новая"); },
  get in_progress() { return t("В работе"); },
  get sold() { return t("Продано"); },
  get not_sold() { return t("Не продано"); },
};

export const STATUS_VARIANT: Record<LeadStatus, "warning" | "accent" | "success" | "danger"> = {
  new: "warning",
  in_progress: "accent",
  sold: "success",
  not_sold: "danger",
};

export const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "too_expensive", get label() { return t("Дорого"); } },
  { value: "closed_themselves", get label() { return t("Сами закрыли"); } },
  { value: "nothing_to_offer", get label() { return t("Нечего предложить"); } },
  { value: "not_relevant", get label() { return t("Неактуальная заявка"); } },
  { value: "no_response", get label() { return t("Клиент не отвечает"); } },
  { value: "duplicate_spam", get label() { return t("Дубль/спам"); } },
];

export function lostReasonLabel(reason: LostReason | null) {
  return LOST_REASONS.find((r) => r.value === reason)?.label ?? "—";
}
