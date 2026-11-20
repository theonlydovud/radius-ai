"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Instagram, Loader2, LogOut, Users } from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { logout } from "@/components/current-user";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { goToWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

/**
 * Владелец платформы DexaAI: все компании и вход в любую руководителем-«невидимкой».
 * Страницу видит только он — для остальных API отвечает 404, и их уводит на вход.
 */

type Row = {
  id: string;
  name: string;
  created_at: string;
  status: "active" | "trial" | "expired";
  plan: string | null;
  unlimited: boolean;
  usage: { messages_used: number; messages_limit: number | null; period_end: string | null; users_limit: number | null };
  ai_blocked: "limit" | "period" | null;
  instagram: { name: string; status: string }[];
  users: { name: string; role: string }[];
  current: boolean;
};

const fmt = new Intl.NumberFormat("ru-RU");
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "—");

export default function PlatformPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/platform/companies", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) return router.replace("/login");
        const j = await r.json();
        setRows(j.data ?? []);
      })
      .catch(() => setError("Сервер недоступен."));
  }, [router]);

  async function enter(row: Row) {
    setBusy(row.id);
    setError("");
    try {
      const r = await fetch("/api/platform/enter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: row.id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Не удалось войти.");
      goToWorkspace(j.data.next, router, j.data.company, true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось войти.");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <DexaLogo size={26} />
            <span className="rounded-full bg-[#121318] px-2.5 py-1 text-[11px] font-semibold text-white">Владелец платформы</span>
          </div>
          <div className="flex items-center gap-1">
            <LangSwitcher />
            <ThemeToggle />
            <button type="button" onClick={() => logout("all")} className="ml-1 flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-red-600">
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Компании</h1>
        <p className="mt-1 text-sm text-slate-500">Войдите в любую компанию с правами руководителя. Сотрудники компании вас не видят.</p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 space-y-3">
          {!rows ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
            </p>
          ) : (
            rows.map((c) => {
              const pct = c.usage.messages_limit ? Math.min(100, Math.round((c.usage.messages_used / c.usage.messages_limit) * 100)) : null;
              return (
                <div key={c.id} className={cn("flex flex-col gap-3 rounded-xl border bg-surface p-4 sm:flex-row sm:items-center", c.current ? "border-brand ring-1 ring-brand" : "border-slate-200")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{c.unlimited ? "без лимитов" : c.plan ?? "—"}</span>
                      {c.status === "trial" && <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">пробный</span>}
                      {(c.status === "expired" || c.ai_blocked) && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">бот остановлен</span>}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Instagram className="h-3.5 w-3.5" />
                        {c.instagram.length ? c.instagram.map((a) => a.name).join(", ") : "не подключён"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {c.users.map((u) => u.name).join(", ") || "—"}
                      </span>
                      <span>
                        сообщения: {fmt.format(c.usage.messages_used)}
                        {c.usage.messages_limit ? ` / ${fmt.format(c.usage.messages_limit)}${pct !== null ? ` (${pct}%)` : ""}` : ""}
                      </span>
                      {c.usage.period_end && <span>до {date(c.usage.period_end)}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => enter(c)}
                    disabled={busy !== null}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                  >
                    {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Войти
                  </button>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
