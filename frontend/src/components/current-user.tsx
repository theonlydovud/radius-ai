"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DexaMark } from "@/components/brand/dexa-logo";
import type { Manager } from "@/types";
import { t } from "@/lib/i18n";
import { workspaceUrl } from "@/lib/workspace";

/**
 * Кто вошёл. Вход проверяет backend (куки dexa_c — компания, dexa_u — человек),
 * здесь только читаем /api/auth/me и разводим по страницам:
 *   нет компании → /login, нет человека → /select,
 *   руководитель → панель с меню, менеджер → /crm (только свои заявки),
 *   супер-админ → /admin (все заявки и статистика, больше ничего).
 */

export type Role = "owner" | "manager" | "admin";
/** active — платная; trial — пробный период (всё открыто); expired — пробный закончился, только кабинет. */
export type CompanyStatus = "active" | "trial" | "expired";
export type SessionCompany = {
  id: string;
  name: string;
  status?: CompanyStatus;
  trial_ends_at?: string | null;
  subdomain?: string | null;
  lead_kind?: "cargo" | "generic";
  telegram_leads?: boolean;
  /** Наша компания (Radius): без тарифных ограничений. */
  unlimited?: boolean;
  plan?: { code: string; name: string; price: number } | null;
  /** Что открыто тарифом; нет поля (старый backend) — открыто всё. */
  features?: Partial<Record<Feature, boolean>>;
  usage?: {
    messages_used: number;
    messages_limit: number | null;
    period_end: string | null;
    users_limit: number | null;
    instagram_accounts: number | null;
  };
  ai_blocked?: "limit" | "period" | null;
};

export type Feature = "manual_leads" | "chat_history" | "stats" | "lead_transfer" | "assistant";

/** Открыта ли функция тарифом. Сервер проверяет то же самое и отвечает 403 plan_required. */
export function hasFeature(company: SessionCompany | null | undefined, feature: Feature) {
  return company?.features?.[feature] !== false;
}
export type Session = {
  company: SessionCompany | null;
  user: { id: string; name: string; role: Role; manager_id: string | null } | null;
  users: { id: string; name: string; role: Role }[];
  /** В этот аккаунт вошли с другого устройства — здесь вход закончился. */
  replaced?: boolean;
};

export const ROLE_LABEL: Record<Role, string> = { get owner() { return t("Руководитель"); }, get manager() { return t("Менеджер"); }, get admin() { return t("Супер-админ"); } };

/** Пробный период закончился — у компании остаётся только кабинет. */
export function isExpired(company: Session["company"]) {
  return company?.status === "expired";
}

/** Сколько дней пробного периода осталось (округление вверх), null — не на пробном. */
export function trialDaysLeft(company: Session["company"]) {
  if (company?.status !== "trial" || !company.trial_ends_at) return null;
  return Math.max(0, Math.ceil((Date.parse(company.trial_ends_at) - Date.now()) / 86_400_000));
}

export function homeFor(role: Role) {
  return role === "owner" ? "/leads" : role === "admin" ? "/admin" : "/crm";
}

export async function fetchSession(): Promise<Session> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? t("Сервер недоступен."));
  return json.data as Session;
}

export async function logout(scope: "user" | "all") {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  }).catch(() => {});
  window.location.href = scope === "all" ? "/login" : "/select";
}

/** Куда вернуться после входа: только внутренние пути. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export type CurrentUser = { id: string; name: string; role: Role; roleLabel: string; managerId: string | null };

type CurrentUserContextValue = {
  user: CurrentUser;
  company: SessionCompany;
  /** Все менеджеры очереди (загружаются для руководителя и супер-админа). */
  managers: Manager[];
  ready: boolean;
  reloadManagers: () => Promise<void>;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function FullScreenLoader({ text }: { text?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <DexaMark size={40} className="animate-pulse" />
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {text ?? t("Загрузка...")}
      </p>
    </div>
  );
}

/**
 * Пускает на страницу только нужную роль. Ссылка из Telegram (/leads?lead=…)
 * у менеджера открывается в его CRM с той же заявкой.
 */
/** role — кто может быть на странице; "cabinet" — кабинет компании на пробном периоде. */
export function CurrentUserProvider({ role, children }: { role: Role | "cabinet"; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managersReady, setManagersReady] = useState(role === "manager");

  const reloadManagers = useCallback(async () => {
    try {
      const res = await fetch("/api/managers", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setManagers(json.data ?? []);
    } catch {
      /* список менеджеров нужен только для фильтров */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((s) => {
        if (cancelled) return;
        const here = `${pathname}${window.location.search}`;
        // Один аккаунт — одно устройство: вошли с другого — здесь просим войти заново.
        if (s.replaced) return router.replace("/login?replaced=1");
        if (!s.company) return router.replace(`/login?next=${encodeURIComponent(here)}`);
        if (!s.user) return router.replace(`/select?next=${encodeURIComponent(here)}`);
        // Каждая компания работает на своём адресе: Radius — radius.dexa.uz, остальные — dexa.uz.
        const own = workspaceUrl(here, s.company);
        if (own !== here) return window.location.replace(own);
        // Пробный период закончился — только кабинет; платной компании кабинет не нужен.
        if (isExpired(s.company) && role !== "cabinet") return router.replace("/cabinet");
        if (s.company.status === "active" && role === "cabinet") return router.replace(homeFor(s.user.role));
        if (role !== "cabinet" && s.user.role !== role) return router.replace(`${homeFor(s.user.role)}${window.location.search}`);
        setSession(s);
      })
      .catch((e) => !cancelled && setError(e?.message ?? t("Сервер недоступен.")));
    return () => {
      cancelled = true;
    };
  }, [role, router, pathname]);

  useEffect(() => {
    if (session?.user && session.user.role !== "manager") reloadManagers().finally(() => setManagersReady(true));
  }, [session, reloadManagers]);

  const value = useMemo<CurrentUserContextValue | null>(() => {
    if (!session?.user || !session.company) return null;
    const u = session.user;
    return {
      user: { id: u.id, name: u.name, role: u.role, roleLabel: ROLE_LABEL[u.role], managerId: u.manager_id },
      company: session.company,
      managers,
      ready: managersReady,
      reloadManagers,
    };
  }, [session, managers, managersReady, reloadManagers]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <DexaMark size={40} />
        <p className="text-sm text-slate-600">{error}</p>
        <button className="text-sm font-medium text-brand hover:underline" onClick={() => window.location.reload()}>
          {t("Обновить страницу")}</button>
      </div>
    );
  }
  if (!value) return <FullScreenLoader />;
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  const value = useContext(CurrentUserContext);
  if (!value) throw new Error(t("useCurrentUser должен быть внутри CurrentUserProvider"));
  return value;
}
