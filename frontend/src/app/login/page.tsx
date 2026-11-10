"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchSession, homeFor, safeNext } from "@/components/current-user";

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
        if (s.user) router.replace(next ?? homeFor(s.user.role));
        else if (s.company) router.replace(`/select${next ? `?next=${encodeURIComponent(next)}` : ""}`);
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
        setError(json.error ?? "Не удалось войти.");
        return;
      }
      const step = json.data?.next;
      if (step === "select") router.push(`/select${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      else router.push(next ?? homeFor(step === "owner" ? "owner" : "manager"));
    } catch {
      setError("Сервер недоступен. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-[0_20px_60px_-20px_rgba(47,91,232,0.25)] backdrop-blur-xl sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Вход в платформу</h1>
      <p className="mt-1 text-sm text-slate-500">Логин и пароль вашей компании.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login">Логин</Label>
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
          <Label htmlFor="password">Пароль</Label>
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
          Войти
        </Button>
      </form>

      <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
        Устройство запомнится: в следующий раз вводить логин и пароль не придётся.
      </p>
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
