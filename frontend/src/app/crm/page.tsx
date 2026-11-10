"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ClipboardList,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  Weight,
  X,
} from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { logout, useCurrentUser } from "@/components/current-user";
import { CloseLeadDialog, type CloseMode } from "@/components/close-lead-dialog";
import { DailyOutcomeChart, RankedBars, SERIES, StatusSplit } from "@/components/crm/charts";
import { LeadChatSheet } from "@/components/crm/lead-chat-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lostReasonLabel, STATUS_LABEL, STATUS_VARIANT } from "@/lib/lead-meta";
import { cn, dayEndISO, dayStartISO, formatDate, initials, toDateInput } from "@/lib/utils";
import type { Lead, LeadStats } from "@/types";

const REFRESH_MS = 30_000;

type LeadTab = "active" | "sold" | "not_sold" | "all";
const LEAD_TABS: { value: LeadTab; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "sold", label: "Продано" },
  { value: "not_sold", label: "Не продано" },
  { value: "all", label: "Все" },
];

type Period = "today" | "week" | "month" | "quarter";
const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "today", label: "Сегодня", days: 0 },
  { value: "week", label: "7 дней", days: 6 },
  { value: "month", label: "30 дней", days: 29 },
  { value: "quarter", label: "90 дней", days: 89 },
];

function inTab(lead: Lead, tab: LeadTab) {
  if (tab === "all") return true;
  if (tab === "active") return lead.status === "new" || lead.status === "in_progress";
  return lead.status === tab;
}

function isClosed(lead: Lead) {
  return lead.status === "sold" || lead.status === "not_sold";
}

function ago(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  return formatDate(iso);
}

/** 1 заявка, 2 заявки, 5 заявок. */
function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
}

// ---------------------------------------------------------------------

function TopBar() {
  const { user, company } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <DexaLogo size={28} />
          <span className="hidden truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 sm:inline">{company.name}</span>
        </div>
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#3D6BFF] to-[#22a2c8] text-xs font-semibold text-white">
              {initials(user.name)}
            </span>
            <span className="hidden text-sm font-medium text-slate-800 sm:inline">{user.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">
                  {user.roleLabel} · {company.name}
                </p>
              </div>
              <div className="my-1 h-px bg-slate-100" />
              <button role="menuitem" onClick={() => logout("user")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Users className="h-4 w-4 text-slate-400" />
                Сменить пользователя
              </button>
              <button role="menuitem" onClick={() => logout("all")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <LogOut className="h-4 w-4" />
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Tile({ label, value, hint, color, accent }: { label: string; value: string | number; hint?: string; color?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-white p-4 shadow-sm", accent ? "border-[#eda100]/50 ring-1 ring-[#eda100]/30" : "border-slate-200")}>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        {color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function LeadRow({
  lead,
  focused,
  busy,
  onPatch,
  onClose,
  onChat,
}: {
  lead: Lead;
  focused: boolean;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onClose: (mode: CloseMode) => void;
  onChat: () => void;
}) {
  const d = lead.collected_data;
  return (
    <Card
      id={`lead-${lead.id}`}
      className={cn(
        "relative overflow-hidden p-4 transition-shadow hover:shadow-md",
        focused && "ring-2 ring-brand",
        lead.status === "new" && "border-[#eda100]/40"
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: SERIES[lead.status].color }}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 lg:w-56">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{lead.client_name}</p>
            <Badge variant={STATUS_VARIANT[lead.status]} className="shrink-0">
              {STATUS_LABEL[lead.status]}
            </Badge>
          </div>
          <a href={`tel:${lead.client_phone.replace(/[^\d+]/g, "")}`} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            <Phone className="h-3.5 w-3.5" />
            {lead.client_phone}
          </a>
          <p className="mt-0.5 text-xs text-slate-400">{ago(lead.created_at)}</p>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 text-sm text-slate-600 sm:grid-cols-[1.5fr_0.8fr_1fr] sm:gap-3">
          <p className="flex min-w-0 items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">
              {d?.origin_city ?? "—"} → {d?.destination_city ?? "—"}
            </span>
          </p>
          <p className="flex min-w-0 items-center gap-2">
            <Weight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{d?.weight ?? "вес не указан"}</span>
          </p>
          <p className="flex min-w-0 items-center gap-2">
            <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{d?.cargo_type ?? "груз не указан"}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
          <Button variant="ghost" size="sm" onClick={onChat} className="text-slate-600">
            <MessageCircle className="h-3.5 w-3.5" />
            Переписка
          </Button>
          {isClosed(lead) ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onPatch({ status: "in_progress" })}>
              <RotateCcw className="h-3.5 w-3.5" />
              Вернуть в работу
            </Button>
          ) : (
            <>
              {lead.status === "new" && (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onPatch({ status: "in_progress" })}>
                  <Play className="h-3.5 w-3.5" />
                  Взять
                </Button>
              )}
              <Button size="sm" disabled={busy} onClick={() => onClose("sold")}>
                <Check className="h-3.5 w-3.5" />
                Продано
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onClose("not_sold")}>
                <X className="h-3.5 w-3.5" />
                Не продано
              </Button>
            </>
          )}
        </div>
      </div>

      {isClosed(lead) && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {lead.status === "sold" ? "Продано" : `Не продано · ${lostReasonLabel(lead.lost_reason)}`}
          {lead.closed_at ? ` · ${formatDate(lead.closed_at)}` : ""}
          {lead.lost_comment ? ` · ${lead.lost_comment}` : ""}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------

export default function CrmPage() {
  const { user } = useCurrentUser();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsError, setLeadsError] = useState("");
  const [tab, setTab] = useState<LeadTab>("active");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ lead: Lead; mode: CloseMode } | null>(null);
  const [chatLead, setChatLead] = useState<Lead | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("month");
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [statsError, setStatsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads?status=all", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLeads(json.data ?? []);
      setLeadsError("");
    } catch (e: any) {
      setLeadsError(e?.message || "Не удалось загрузить заявки.");
    }
  }, []);

  const loadStats = useCallback(async () => {
    const days = PERIODS.find((p) => p.value === period)!.days;
    const params = new URLSearchParams({
      from: dayStartISO(daysAgo(days)),
      to: dayEndISO(daysAgo(0)),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    try {
      const res = await fetch(`/api/leads/stats?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStats(json.data);
      setStatsError("");
    } catch (e: any) {
      setStatsError(e?.message || "Не удалось загрузить показатели.");
    }
  }, [period]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadLeads(), loadStats()]);
    setRefreshing(false);
  }, [loadLeads, loadStats]);

  // Ссылка из Telegram: /crm?lead=<id> — показываем все заявки и подсвечиваем эту.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lead");
    if (id) {
      setFocusId(id);
      setTab("all");
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Новые заявки появляются сами: опрос раз в 30 с, пока вкладка открыта.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadLeads();
        loadStats();
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadLeads, loadStats]);

  useEffect(() => {
    if (focusId && leads) document.getElementById(`lead-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, leads]);

  const counts = useMemo(() => {
    const all = leads ?? [];
    return {
      active: all.filter((l) => inTab(l, "active")).length,
      sold: all.filter((l) => l.status === "sold").length,
      not_sold: all.filter((l) => l.status === "not_sold").length,
      all: all.length,
      new: all.filter((l) => l.status === "new").length,
      in_progress: all.filter((l) => l.status === "in_progress").length,
    };
  }, [leads]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? [])
      .filter((l) => inTab(l, tab))
      .filter((l) => {
        if (!q) return true;
        const d = l.collected_data ?? {};
        return [l.client_name, l.client_phone, d.origin_city, d.destination_city, d.cargo_type, d.weight]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      // Активные: сначала новые, их нужно взять.
      .sort((a, b) => (tab === "active" ? Number(b.status === "new") - Number(a.status === "new") : 0));
  }, [leads, tab, query]);

  async function patchLead(lead: Lead, body: Record<string, unknown>) {
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      setLeadsError(res.ok ? "" : json.error ?? "Не удалось сохранить изменения.");
      await refresh();
    } catch {
      setLeadsError("Не удалось сохранить изменения. Проверьте соединение.");
    } finally {
      setBusyId(null);
    }
  }

  const firstName = user.name.split(/\s+/)[0];
  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase();
  const reasons = (stats?.reasons ?? []).filter((r) => r.count > 0).map((r) => ({ label: lostReasonLabel(r.reason), count: r.count, percent: r.percent }));
  const routes = (stats?.routes ?? []).map((r) => ({ label: r.route, count: r.count }));

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <TopBar />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {/* Приветствие и сводка */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {counts.new > 0 ? (
                <>
                  <span className="font-medium text-slate-900">{counts.new}</span> {plural(counts.new, "новая заявка ждёт", "новые заявки ждут", "новых заявок ждут")} вас ·{" "}
                </>
              ) : (
                "Новых заявок нет · "
              )}
              в работе: <span className="font-medium text-slate-900">{counts.in_progress}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="self-start sm:self-auto">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Обновить
          </Button>
        </div>

        {/* Заявки */}
        <section className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={tab} onValueChange={(v) => setTab(v as LeadTab)} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <TabsList className="inline-flex w-max md:w-auto">
                {LEAD_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="flex-none gap-1.5 whitespace-nowrap px-3">
                    {t.label}
                    <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] tabular-nums text-slate-600">{counts[t.value]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, телефон, город, груз" className="h-9 pl-9" />
            </div>
          </div>

          {leadsError && <p className="mt-3 text-sm text-red-600">{leadsError}</p>}

          <div className="mt-4 space-y-3">
            {!leads ? (
              [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white/70" />)
            ) : visible.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 p-10 text-center">
                <ClipboardList className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {query ? "Ничего не найдено." : tab === "active" ? "Активных заявок нет. Новые появятся здесь сами." : "Заявок здесь пока нет."}
                </p>
              </Card>
            ) : (
              visible.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  focused={focusId === lead.id}
                  busy={busyId === lead.id}
                  onPatch={(body) => patchLead(lead, body)}
                  onClose={(mode) => setClosing({ lead, mode })}
                  onChat={() => setChatLead(lead)}
                />
              ))
            )}
          </div>
        </section>

        {/* Показатели */}
        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Мои показатели</h2>
              <p className="text-sm text-slate-500">Заявки, полученные за {periodLabel === "сегодня" ? "сегодня" : periodLabel}.</p>
            </div>
            <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <TabsList className="flex w-full sm:inline-flex sm:w-auto">
                {PERIODS.map((p) => (
                  <TabsTrigger key={p.value} value={p.value} className="flex-1 px-2 sm:flex-none sm:px-3">
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {statsError && <p className="mt-3 text-sm text-red-600">{statsError}</p>}

          {!stats ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-white/70" />
              ))}
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Получено" value={stats.totals.total} />
                <Tile label="Новые" value={stats.totals.new} color={SERIES.new.color} accent={stats.totals.new > 0} />
                <Tile label="В работе" value={stats.totals.in_progress} color={SERIES.in_progress.color} />
                <Tile label="Продано" value={stats.totals.sold} color={SERIES.sold.color} />
                <Tile label="Не продано" value={stats.totals.not_sold} color={SERIES.not_sold.color} />
                <Tile
                  label="Конверсия"
                  value={stats.totals.conversion === null ? "—" : `${stats.totals.conversion}%`}
                  hint="продано / закрытые"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Заявки по дням</CardTitle>
                    <CardDescription>Высота — сколько пришло, цвет — чем закончились</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {stats.totals.total === 0 ? <p className="text-sm text-slate-400">За этот период заявок нет.</p> : <DailyOutcomeChart daily={stats.daily} />}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Итоги периода</CardTitle>
                    <CardDescription>Где сейчас ваши заявки</CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {stats.totals.total === 0 ? <p className="text-sm text-slate-400">Пока пусто.</p> : <StatusSplit totals={stats.totals} />}
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Причины отказа</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <RankedBars rows={reasons} empty="Отказов за этот период нет." />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Направления</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <RankedBars rows={routes} empty="Направлений пока нет." />
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </section>
      </main>

      {closing && (
        <CloseLeadDialog
          lead={closing.lead}
          mode={closing.mode}
          onClose={() => setClosing(null)}
          onClosed={() => {
            setClosing(null);
            refresh();
          }}
        />
      )}
      <LeadChatSheet lead={chatLead} onClose={() => setChatLead(null)} />
    </div>
  );
}
