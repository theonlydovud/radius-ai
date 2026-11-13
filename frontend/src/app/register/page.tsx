"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { TelegramAuthButton } from "@/components/telegram-auth";
import { fetchSession, homeFor, isExpired } from "@/components/current-user";
import { locale, t } from "@/lib/i18n";
import { POPULAR_PLAN, usePlans } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { goToWorkspace } from "@/lib/workspace";

/**
 * Регистрация в DexaAI: выбрать тариф и нажать одну кнопку — вход через Telegram-бота, без паролей.
 * 14 дней бесплатно на выбранном тарифе. ?plan=pro — тариф, выбранный на лендинге.
 */
function RegisterCard() {
  const router = useRouter();
  const plans = usePlans();
  const fromUrl = useSearchParams().get("plan");
  const [plan, setPlan] = useState(fromUrl && ["start", "business", "pro"].includes(fromUrl) ? fromUrl : POPULAR_PLAN);
  const fmt = new Intl.NumberFormat(locale());
  const chosen = plans.find((p) => p.code === plan) ?? plans[0];

  // Уже есть аккаунт на этом устройстве — сразу в кабинет или рабочее место.
  useEffect(() => {
    fetchSession()
      .then((s) => {
        if (!s.user) return;
        goToWorkspace(isExpired(s.company) ? "/cabinet" : homeFor(s.user.role), router, s.company, true);
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="rounded-2xl border border-white/60 bg-surface/80 p-6 shadow-[0_20px_60px_-20px_rgba(91,76,237,0.25)] backdrop-blur-xl sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{t("Регистрация в DexaAI")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("Выберите тариф — первые 14 дней бесплатно. Карта не нужна.")}</p>

      <div role="radiogroup" aria-label={t("Тариф")} className="mt-5 space-y-2">
        {plans.map((p) => {
          const active = p.code === plan;
          return (
            <button
              key={p.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPlan(p.code)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                active ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", active ? "border-brand bg-brand" : "border-slate-300")}>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {p.name}
                  {p.code === POPULAR_PLAN && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{t("Популярный")}</span>}
                </span>
                <span className="block text-xs text-slate-500">
                  {t("{0} сообщений в месяц", fmt.format(p.messages_limit))} · {p.users_included === 1 ? t("1 пользователь") : t("{0} пользователя", p.users_included)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-slate-900">{fmt.format(p.price)}</span>
                <span className="block text-[11px] text-slate-400">{t("сум/мес")}</span>
              </span>
            </button>
          );
        })}
      </div>

      {chosen && (
        <ul className="mt-4 grid grid-cols-1 gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
          {[
            chosen.features.stats && t("Статистика и конверсия"),
            chosen.features.chat_history && t("История чатов и перехват"),
            chosen.features.lead_transfer && t("Менеджеры и передача заявок"),
            chosen.features.assistant && t("ИИ-ассистент: текст и голос"),
            t("Заявки, правила и база знаний"),
            t("Ответы на языке клиента"),
          ]
            .filter(Boolean)
            .map((x) => (
              <li key={x as string} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
                {x}
              </li>
            ))}
        </ul>
      )}

      <div className="mt-6">
        <TelegramAuthButton label={t("Начать 14 дней бесплатно")} plan={plan} />
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">{t("Регистрация через Telegram-бота: одна кнопка, без паролей и форм.")}</p>

      <p className="mt-5 text-center text-sm text-slate-500">
        {t("Уже есть аккаунт?")}{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          {t("Войти")}
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell footer="© 2026 DexaAI">
      <Suspense>
        <RegisterCard />
      </Suspense>
    </AuthShell>
  );
}
