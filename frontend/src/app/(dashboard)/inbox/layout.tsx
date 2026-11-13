"use client";

import { hasFeature, useCurrentUser } from "@/components/current-user";
import { PlanLocked } from "@/components/plan-card";

/** Закрыто тарифом — заглушка вместо страницы (сервер данные тоже не отдаёт). */
export default function Layout({ children }: { children: React.ReactNode }) {
  const { company } = useCurrentUser();
  return hasFeature(company, "chat_history") ? <>{children}</> : <PlanLocked feature="chat_history" />;
}
