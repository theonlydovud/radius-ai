"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Building2, Sparkles } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { TelegramAuthButton } from "@/components/telegram-auth";
import { fetchSession, homeFor, isPending } from "@/components/current-user";
import { t } from "@/lib/i18n";
import { goToWorkspace } from "@/lib/workspace";

/** Регистрация в DexaAI одной кнопкой: через Telegram-бота, без паролей. */
export default function RegisterPage() {
  const router = useRouter();

  // Уже есть аккаунт на этом устройстве — сразу в кабинет или рабочее место.
  useEffect(() => {
    fetchSession()
      .then((s) => {
        if (!s.user) return;
        if (isPending(s.company)) router.replace("/cabinet");
        else goToWorkspace(homeFor(s.user.role), router, true);
      })
      .catch(() => {});
  }, [router]);

  return (
    <AuthShell footer="© 2026 DexaAI">
      <div className="rounded-2xl border border-white/60 bg-surface/80 p-6 shadow-[0_20px_60px_-20px_rgba(47,91,232,0.25)] backdrop-blur-xl sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{t("Регистрация в DexaAI")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("Одна кнопка — и аккаунт готов. Без паролей и форм.")}</p>

        <div className="mt-6">
          <TelegramAuthButton label={t("Зарегистрироваться через Telegram")} />
        </div>

        <ul className="mt-6 space-y-3 text-sm text-slate-600">
          {[
            { icon: Building2, text: "Личный кабинет компании — сразу после регистрации" },
            { icon: Sparkles, text: "ИИ-менеджер для Instagram Direct — подключаем после консультации" },
            { icon: Bell, text: "Новости и полезное от DexaAI — в нашем Telegram-боте" },
          ].map((x) => (
            <li key={x.text} className="flex items-start gap-2.5">
              <x.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              {t(x.text)}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-sm text-slate-500">
          {t("Уже есть аккаунт?")}{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            {t("Войти")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
