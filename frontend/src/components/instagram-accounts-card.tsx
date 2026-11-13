"use client";

import Link from "next/link";
import { ChevronRight, Instagram, Plus } from "lucide-react";
import { useAccountFilter } from "@/components/account-switcher";
import { useCurrentUser, type SessionCompany } from "@/components/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Сколько Instagram-аккаунтов можно подключить: у наших компаний (unlimited) — сколько угодно,
 * у остальных — по тарифу (сейчас один). Сервер проверяет то же самое (accounts_limit).
 */
export function instagramLimit(company: SessionCompany): number | null {
  if (company.unlimited) return null;
  return company.usage?.instagram_accounts ?? 1;
}

/** «Настройки» → Instagram-аккаунты компании: статус и переход к подключению/управлению. */
export function InstagramAccountsCard() {
  const { company } = useCurrentUser();
  const ctx = useAccountFilter();
  const accounts = ctx?.accounts ?? [];
  const limit = instagramLimit(company);
  const canAdd = limit === null || accounts.length < limit;

  return (
    <Card className="mb-6 max-w-2xl">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]">
            <Instagram className="h-4 w-4 text-white" />
          </div>
          <div>
            <CardTitle>{t("Instagram-аккаунты")}</CardTitle>
            <p className="text-xs text-slate-400">
              {limit === null ? t("Можно подключить несколько аккаунтов.") : t("Один аккаунт — одна компания.")}
            </p>
          </div>
        </div>
        <Link href="/accounts" className="text-sm font-medium text-brand hover:underline">
          {t("Управлять")}
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {!ctx?.ready ? (
          <p className="text-sm text-slate-400">{t("Загрузка...")}</p>
        ) : (
          accounts.map((a) => (
            <Link key={a.id} href="/accounts" className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", a.status === "connected" ? "bg-emerald-500" : "bg-red-500")} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{a.account_name}</span>
              <span className={cn("text-xs", a.status === "connected" ? "text-emerald-600" : "text-red-500")}>
                {a.status === "connected" ? t("Подключён") : t("Нужно переподключить")}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </Link>
          ))
        )}
        {ctx?.ready && canAdd && (
          <Link
            href="/accounts?add=1"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-600 hover:border-brand hover:text-brand"
          >
            <Plus className="h-4 w-4" />
            {accounts.length ? t("Подключить ещё Instagram") : t("Подключить Instagram")}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
