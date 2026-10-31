import type { LeadStatus, LostReason } from "@/types";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  sold: "Продано",
  not_sold: "Не продано",
};

export const STATUS_VARIANT: Record<LeadStatus, "warning" | "accent" | "success" | "danger"> = {
  new: "warning",
  in_progress: "accent",
  sold: "success",
  not_sold: "danger",
};

export const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "too_expensive", label: "Дорого" },
  { value: "closed_themselves", label: "Сами закрыли" },
  { value: "nothing_to_offer", label: "Нечего предложить" },
  { value: "not_relevant", label: "Неактуальная заявка" },
  { value: "no_response", label: "Клиент не отвечает" },
  { value: "duplicate_spam", label: "Дубль/спам" },
];

export function lostReasonLabel(reason: LostReason | null) {
  return LOST_REASONS.find((r) => r.value === reason)?.label ?? "—";
}
