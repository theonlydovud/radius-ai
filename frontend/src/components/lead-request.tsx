import { MessageSquareText } from "lucide-react";
import type { LeadCollectedData } from "@/types";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Заявка компании не из логистики: вместо маршрута, веса и груза — «что хочет клиент»
 * (collected_data.request, его собирает ИИ или вводят вручную).
 */
export function isGenericLead(d: LeadCollectedData | null | undefined) {
  return Boolean(d && !d.origin_city && !d.destination_city && !d.weight && !d.cargo_type);
}

export function LeadRequest({ d, className, iconClassName = "h-3.5 w-3.5" }: { d: LeadCollectedData | null | undefined; className?: string; iconClassName?: string }) {
  return (
    <p className={cn("flex min-w-0 items-start gap-2", className)}>
      <MessageSquareText className={cn("mt-0.5 shrink-0 text-slate-400", iconClassName)} />
      <span className="line-clamp-2 min-w-0 break-words">{d?.request || t("запрос не указан")}</span>
    </p>
  );
}
