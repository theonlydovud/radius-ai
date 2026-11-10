"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Crown, Loader2, LogOut } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { fetchSession, homeFor, logout, ROLE_LABEL, safeNext, type Session } from "@/components/current-user";
import { cn, initials } from "@/lib/utils";

type Person = Session["users"][number];

function Avatar({ person, size = "md" }: { person: Person; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        person.role === "owner" ? "bg-gradient-to-br from-[#5B4BFF] to-[#A445F5]" : "bg-gradient-to-br from-[#3D6BFF] to-[#22a2c8]",
        size === "lg" ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm"
      )}
    >
      {initials(person.name)}
    </span>
  );
}

function SelectPerson() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [session, setSession] = useState<Session | null>(null);
  const [picked, setPicked] = useState<Person | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSession()
      .then((s) => {
        if (!s.company) return router.replace(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
        if (s.user) return router.replace(next ?? homeFor(s.user.role));
        setSession(s);
      })
      .catch((e) => setError(e?.message ?? "Сервер недоступен."));
  }, [router, next]);

  useEffect(() => {
    if (picked) passwordRef.current?.focus();
  }, [picked]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: picked.id, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Не удалось войти.");
        return;
      }
      router.push(next ?? homeFor(picked.role));
    } catch {
      setError("Сервер недоступен. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return error ? (
      <p className="text-center text-sm text-red-600">{error}</p>
    ) : (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-[0_20px_60px_-20px_rgba(47,91,232,0.25)] backdrop-blur-xl sm:p-8">
      {!picked ? (
        <>
          <p className="text-xs font-medium uppercase tracking-wider text-brand">{session.company?.name}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Выберите менеджера</h1>
          <p className="mt-1 text-sm text-slate-500">Кто сейчас работает на этом устройстве?</p>

          <ul className="mt-6 space-y-2">
            {session.users.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(person);
                    setPassword("");
                    setError("");
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Avatar person={person} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{person.name}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      {person.role === "owner" && <Crown className="h-3 w-3 text-[#7a4cf5]" />}
                      {ROLE_LABEL[person.role]}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form onSubmit={submit}>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="-ml-1 mb-4 flex items-center gap-1 rounded-md px-1 py-1 text-xs text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Другой пользователь
          </button>
          <div className="flex flex-col items-center text-center">
            <Avatar person={picked} size="lg" />
            <p className="mt-3 text-lg font-semibold text-slate-900">{picked.name}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[picked.role]}</p>
          </div>
          <div className="mt-6 space-y-1.5">
            <label htmlFor="person-password" className="text-sm font-medium text-slate-700">
              Пароль
            </label>
            <PasswordInput
              id="person-password"
              ref={passwordRef}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-11"
            />
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-4 h-11 w-full" disabled={busy || !password}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Войти
          </Button>
        </form>
      )}
    </div>
  );
}

export default function SelectPage() {
  return (
    <AuthShell
      footer={
        <button onClick={() => logout("all")} className="inline-flex items-center gap-1.5 hover:text-slate-700">
          <LogOut className="h-3.5 w-3.5" />
          Выйти из аккаунта компании
        </button>
      }
    >
      <Suspense>
        <SelectPerson />
      </Suspense>
    </AuthShell>
  );
}
