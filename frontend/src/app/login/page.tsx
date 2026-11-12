"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchSession, homeFor, isExpired, safeNext } from "@/components/current-user";
import { TelegramAuthButton } from "@/components/telegram-auth";
import Link from "next/link";
import { goToWorkspace } from "@/lib/workspace";
import { t } from "@/lib/i18n";

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Устройство уже помнит вход — сразу дальше.
  useEffect(() => {
    fetchSession()
      .then((s) => {
        // Уже вошли — сразу в рабочее место (на сайте продукта это другой адрес).
        if (s.user && isExpired(s.company)) goToWorkspace("/cabinet", router, s.company, true);
        else if (s.user) goToWorkspace(next ?? homeFor(s.user.role), router, s.company, true);
        else if (s.company) goToWorkspace(`/select${next ? `?next=${encodeURIComponent(next)}` : ""}`, router, s.company, true);
      })
      .catch(() => {});
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? t("Не удалось войти."));
        return;
      }
      const step = json.data?.next;
      // Только после правильных логина и пароля — переход в рабочее место компании.
      // Адрес компании (поддомен) знает сессия — она уже открыта этим входом.
      const company = (await fetchSession().catch(() => null))?.company;
      if (step === "select") goToWorkspace(`/select${next ? `?next=${encodeURIComponent(next)}` : ""}`, router, company);
      else goToWorkspace(isExpired(company ?? null) ? "/cabinet" : next ?? homeFor(step), router, company);
    } catch {
      setError(t("Сервер недоступен. Проверьте интернет и попробуйте ещё раз."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-surface/80 p-6 shadow-[0_20px_60px_-20px_rgba(47,91,232,0.25)] backdrop-blur-xl sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{t("Вход в платформу")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("Логин и пароль вашей компании.")}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login">{t("Логин")}</Label>
          <Input
            id="login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-11"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("Пароль")}</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="h-11"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full text-sm" disabled={busy || !login || !password}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {t("Войти")}</Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        {t("или")}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <TelegramAuthButton label={t("Войти через Telegram")} />
      <p className="mt-4 text-center text-sm text-slate-500">
        {t("Нет аккаунта?")}{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          {t("Зарегистрироваться")}
        </Link>
      </p>

      <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
        {t("Устройство запомнится: в следующий раз вводить логин и пароль не придётся.")}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell footer="© 2026 DexaAI">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
