"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Ban,
  CalendarPlus,
  CheckCheck,
  Instagram,
  Loader2,
  LogOut,
  MessageSquarePlus,
  RefreshCw,
  Search,
  ShieldAlert,
  Snowflake,
  Trash2,
  Unlock,
  Users,
  Wallet,
} from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { logout } from "@/components/current-user";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { goToWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

/**
 * Панель владельца платформы DexaAI: сводка, все компании с действиями (заморозить, забанить,
 * тариф, продлить, сообщения, удалить) и журнал безопасности (джейлбрейк, запрещённые темы,
 * блокировки Gemini, всплески трафика). Видит только владелец платформы — остальным API отвечает 404.
 */

type Company = {
  id: string;
  name: string;
  created_at: string;
  status: "active" | "trial" | "expired";
  plan: string | null;
  plan_code: string | null;
  unlimited: boolean;
  usage: { messages_used: number; messages_limit: number | null; period_end: string | null; users_limit: number | null };
  ai_blocked: "limit" | "period" | null;
  blocked: "frozen" | "banned" | null;
  blocked_reason: string | null;
  trial_ends_at: string | null;
  subdomain: string | null;
  security: { open: number; high: number };
  instagram: { name: string; status: string }[];
  users: { id: string; name: string; role: string; login: string | null }[];
  current: boolean;
};

type Overview = {
  companies: number;
  active: number;
  trial: number;
  expired: number;
  frozen: number;
  banned: number;
  new_7d: number;
  by_plan: Record<string, number>;
  mrr: number;
  messages_used: number;
  security_open: { high: number; total: number };
};

type SecurityEvent = {
  id: string;
  company_id: string | null;
  source: string;
  kind: string;
  severity: "low" | "medium" | "high";
  excerpt: string | null;
  matched: string | null;
  reviewed: boolean;
  created_at: string;
  company: { name: string; blocked: string | null } | null;
};

type ActionKind = "freeze" | "ban" | "unblock" | "plan" | "extend" | "messages" | "delete";

const fmt = new Intl.NumberFormat("ru-RU");
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "—");
const dateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const SOURCE: Record<string, string> = {
  client: "Клиент в Instagram",
  role: "«Роль ИИ» компании",
  playground: "«Диалог с ИИ»",
  assistant: "ИИ-ассистент",
  gemini: "Ответ бота",
  traffic: "Трафик",
};
const KIND: Record<string, string> = {
  jailbreak: "Джейлбрейк",
  illegal: "Запрещённая тема",
  blocked_by_ai: "Gemini заблокировал",
  spike: "Всплеск трафика",
};

async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 404 && path.startsWith("/api/platform")) throw Object.assign(new Error("not_owner"), { notOwner: true });
  if (!res.ok) throw new Error(j.error ?? "Не получилось.");
  return j;
}

export default function PlatformPage() {
  return (
    <Suspense>
      <PlatformPanel />
    </Suspense>
  );
}

function PlatformPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "security" ? "security" : params.get("tab") === "companies" ? "companies" : "overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Company[] | null>(null);
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [eventsNote, setEventsNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ kind: ActionKind; company: Company } | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, c, s] = await Promise.all([api("/api/platform/overview"), api("/api/platform/companies"), api("/api/platform/security")]);
      setOverview(o.data);
      setRows(c.data ?? []);
      setEvents(s.data ?? []);
      setEventsNote(s.error ?? "");
      setError("");
    } catch (e: any) {
      if (e?.notOwner) return router.replace("/login");
      setError(e?.message || "Сервер недоступен.");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function enter(row: Company, userId?: string) {
    setBusy(row.id);
    try {
      const j = await api("/api/platform/enter", { company_id: row.id, ...(userId ? { user_id: userId } : {}) });
      goToWorkspace(j.data.next, router, j.data.company, true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось войти.");
      setBusy(null);
    }
  }

  async function review(body: { id?: string; company_id?: string }) {
    await api("/api/platform/security", body).catch((e) => setError(e.message));
    load();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!rows) return null;
    return q ? rows.filter((c) => [c.name, c.subdomain, ...c.instagram.map((a) => a.name), ...c.users.map((u) => `${u.name} ${u.login ?? ""}`)].join(" ").toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <DexaLogo size={26} />
            <span className="rounded-full bg-[#121318] px-2.5 py-1 text-[11px] font-semibold text-white">Владелец платформы</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={load} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Обновить">
              <RefreshCw className="h-4 w-4" />
            </button>
            <LangSwitcher />
            <ThemeToggle />
            <button type="button" onClick={() => logout("all")} className="ml-1 flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-red-600">
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="companies">Компании{rows ? ` · ${rows.length}` : ""}</TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5">
              Безопасность
              {!!overview?.security_open.total && (
                <span className={cn("rounded-full px-1.5 text-[10px] text-white", overview.security_open.high ? "bg-red-600" : "bg-amber-500")}>{overview.security_open.total}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {tab === "overview" && <OverviewTab overview={overview} onOpen={setTab} />}

        {tab === "companies" && (
          <div className="mt-5">
            <div className="relative mb-4 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Компания, Instagram, сотрудник, логин" className="pl-9" />
            </div>
            {!filtered ? (
              <Loading />
            ) : (
              <div className="space-y-3">
                {filtered.map((c) => (
                  <CompanyCard key={c.id} c={c} busy={busy === c.id} onEnter={(userId) => enter(c, userId)} onAction={(kind) => setDialog({ kind, company: c })} onSecurity={() => { setTab("security"); }} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "security" && (
          <div className="mt-5">
            <p className="mb-4 text-sm text-slate-500">
              Что заметила система: попытки взломать бота, запрещённые темы, ответы, заблокированные Gemini, всплески трафика. Серьёзное сразу приходит вам в Telegram.
              Клиент, который пробует сломать бота, — не вина компании; то же самое в «Роли ИИ» или «Диалоге с ИИ» — уже сама компания.
            </p>
            {eventsNote && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{eventsNote}</p>}
            {!events ? (
              <Loading />
            ) : events.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 p-10 text-center">
                <CheckCheck className="h-6 w-6 text-emerald-500" />
                <p className="text-sm text-slate-500">Новых событий нет.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {events.map((e) => (
                  <Card key={e.id} className={cn("p-3 sm:p-4", e.severity === "high" && "border-red-300 bg-red-50/40 dark:bg-red-500/5")}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", e.severity === "high" ? "bg-red-600 text-white" : e.severity === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>
                            {KIND[e.kind] ?? e.kind}
                          </span>
                          <b className="text-slate-900">{e.company?.name ?? "—"}</b>
                          <span className="text-slate-500">· {SOURCE[e.source] ?? e.source}</span>
                          <span className="text-xs text-slate-400">{dateTime(e.created_at)}</span>
                        </p>
                        {e.matched && <p className="mt-1 text-xs text-slate-500">Совпало: «{e.matched}»</p>}
                        {e.excerpt && <p className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{e.excerpt}</p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {e.company_id && rows?.find((r) => r.id === e.company_id) && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "freeze", company: rows.find((r) => r.id === e.company_id)! })}>
                              <Snowflake className="h-3.5 w-3.5" /> Заморозить
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDialog({ kind: "ban", company: rows.find((r) => r.id === e.company_id)! })}>
                              <Ban className="h-3.5 w-3.5" /> Забанить
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => review({ id: e.id })}>
                          <CheckCheck className="h-3.5 w-3.5" /> Просмотрено
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {dialog && (
        <ActionDialog
          kind={dialog.kind}
          company={dialog.company}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
    </p>
  );
}

function OverviewTab({ overview: o, onOpen }: { overview: Overview | null; onOpen: (tab: string) => void }) {
  if (!o) return <div className="mt-5"><Loading /></div>;
  const tiles: { label: string; value: string; hint?: string; tone?: string; tab?: string }[] = [
    { label: "Компаний", value: fmt.format(o.companies), hint: `+${o.new_7d} за 7 дней`, tab: "companies" },
    { label: "Платят", value: fmt.format(o.active), hint: `на пробном: ${o.trial}`, tab: "companies" },
    { label: "Выручка в месяц", value: `${fmt.format(o.mrr)} сум`, hint: "активные платные тарифы" },
    { label: "Сообщений бота", value: fmt.format(o.messages_used), hint: "в текущих периодах" },
    { label: "Заморожено / забанено", value: `${o.frozen} / ${o.banned}`, tone: o.frozen + o.banned ? "text-amber-600" : undefined, tab: "companies" },
    { label: "Безопасность", value: fmt.format(o.security_open.total), hint: o.security_open.high ? `серьёзных: ${o.security_open.high}` : "серьёзных нет", tone: o.security_open.high ? "text-red-600" : undefined, tab: "security" },
  ];
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className={cn("p-4", t.tab && "cursor-pointer hover:border-slate-300")} onClick={() => t.tab && onOpen(t.tab)}>
            <p className="text-xs text-slate-500">{t.label}</p>
            <p className={cn("mt-1 text-2xl font-semibold text-slate-900", t.tone)}>{t.value}</p>
            {t.hint && <p className="mt-0.5 text-xs text-slate-400">{t.hint}</p>}
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <p className="text-sm font-semibold text-slate-900">По тарифам</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(o.by_plan).map(([plan, n]) => (
            <span key={plan} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
              {plan}: <b>{n}</b>
            </span>
          ))}
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
            Истёк пробный: <b>{o.expired}</b>
          </span>
        </div>
      </Card>
    </div>
  );
}

function CompanyCard({ c, busy, onEnter, onAction, onSecurity }: { c: Company; busy: boolean; onEnter: (userId?: string) => void; onAction: (k: ActionKind) => void; onSecurity: () => void }) {
  const pct = c.usage.messages_limit ? Math.min(100, Math.round((c.usage.messages_used / c.usage.messages_limit) * 100)) : null;
  return (
    <Card className={cn("p-4", c.blocked === "banned" ? "border-red-300 bg-red-50/40 dark:bg-red-500/5" : c.blocked === "frozen" ? "border-sky-300 bg-sky-50/40 dark:bg-sky-500/5" : c.current && "border-brand ring-1 ring-brand")}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{c.name}</p>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{c.unlimited ? "без лимитов" : c.plan ?? "—"}</span>
            {c.status === "trial" && <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] text-brand">пробный до {date(c.trial_ends_at)}</span>}
            {c.status === "expired" && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">пробный истёк</span>}
            {c.blocked === "frozen" && <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">заморожена</span>}
            {c.blocked === "banned" && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">забанена</span>}
            {!c.blocked && c.ai_blocked && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">бот остановлен: {c.ai_blocked === "limit" ? "лимит" : "период"}</span>}
            {c.security.open > 0 && (
              <button type="button" onClick={onSecurity} className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", c.security.high ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")}>
                <ShieldAlert className="h-3 w-3" /> {c.security.open}
              </button>
            )}
          </div>
          {c.blocked_reason && <p className="mt-1 text-xs text-slate-600">Причина: {c.blocked_reason}</p>}
          {/* Войти от лица сотрудника — призраком: его сессия не сбрасывается. */}
          {c.users.some((u) => u.role !== "owner") && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-400">Войти как:</span>
              {c.users
                .filter((u) => u.role !== "owner")
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onEnter(u.id)}
                    className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    {u.name} · {u.role === "manager" ? "менеджер" : u.role === "admin" ? "супер-админ" : u.role}
                  </button>
                ))}
            </div>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Instagram className="h-3.5 w-3.5" />
              {c.instagram.length ? c.instagram.map((a) => a.name).join(", ") : "не подключён"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {c.users.map((u) => `${u.name}${u.login ? ` (${u.login})` : ""}`).join(", ") || "—"}
            </span>
            <span className="flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              {fmt.format(c.usage.messages_used)}
              {c.usage.messages_limit ? ` / ${fmt.format(c.usage.messages_limit)}${pct !== null ? ` (${pct}%)` : ""}` : ""}
            </span>
            {c.usage.period_end && <span>до {date(c.usage.period_end)}</span>}
            {c.subdomain && <span>{c.subdomain}.dexa.uz</span>}
            <span>с {date(c.created_at)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 lg:max-w-[22rem] lg:justify-end">
          <Button size="sm" onClick={() => onEnter()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />} Войти
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction("plan")}>Тариф</Button>
          <Button size="sm" variant="outline" onClick={() => onAction("extend")}>
            <CalendarPlus className="h-3.5 w-3.5" /> Продлить
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction("messages")}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> Сообщения
          </Button>
          {c.blocked ? (
            <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => onAction("unblock")}>
              <Unlock className="h-3.5 w-3.5" /> Разблокировать
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onAction("freeze")}>
                <Snowflake className="h-3.5 w-3.5" /> Заморозить
              </Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => onAction("ban")}>
                <Ban className="h-3.5 w-3.5" /> Забанить
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onAction("delete")}>
            <Trash2 className="h-3.5 w-3.5" /> Удалить
          </Button>
        </div>
      </div>
    </Card>
  );
}

const PLANS = [
  { code: "start", name: "Start" },
  { code: "business", name: "Business" },
  { code: "pro", name: "Pro" },
];

const TITLE: Record<ActionKind, string> = {
  freeze: "Заморозить компанию",
  ban: "Забанить компанию",
  unblock: "Снять блокировку",
  plan: "Сменить тариф",
  extend: "Продлить период",
  messages: "Сообщения бота",
  delete: "Удалить компанию",
};
const HINT: Record<ActionKind, string> = {
  freeze: "Бот перестанет отвечать клиентам. Сотрудники смогут войти и увидят причину сверху.",
  ban: "Вход закроется всем сотрудникам сразу, бот перестанет отвечать. Данные сохранятся — бан можно снять.",
  unblock: "Бот снова начнёт отвечать, сотрудники смогут войти.",
  plan: "Компания станет активной, начнётся новый 30-дневный период, счётчик сообщений обнулится.",
  extend: "Добавит дни к оплаченному периоду (или к пробному, если компания на пробном).",
  messages: "Вернуть сообщения (вычесть из использованных) или обнулить счётчик периода.",
  delete: "Удалит компанию со всеми данными: Instagram, переписки, заявки, сотрудников, роль ИИ. Отменить нельзя.",
};

function ActionDialog({ kind, company, onClose, onDone }: { kind: ActionKind; company: Company; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState(company.plan_code ?? "business");
  const [days, setDays] = useState("30");
  const [add, setAdd] = useState("1000");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(extra: Record<string, unknown> = {}) {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { company_id: company.id, action: kind, ...extra };
      if (kind === "freeze" || kind === "ban") body.reason = reason;
      if (kind === "plan") body.plan = plan;
      if (kind === "extend") body.days = Number(days);
      if (kind === "messages" && extra.reset === undefined) body.add = Number(add);
      if (kind === "delete") body.confirm = confirm;
      await api("/api/platform/action", body);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? "Не получилось.");
      setSaving(false);
    }
  }

  const danger = kind === "ban" || kind === "delete";
  const disabled = saving || ((kind === "freeze" || kind === "ban") && !reason.trim()) || (kind === "delete" && confirm.trim() !== company.name);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {TITLE[kind]}: {company.name}
          </DialogTitle>
          <DialogDescription>{HINT[kind]}</DialogDescription>
        </DialogHeader>

        {(kind === "freeze" || kind === "ban") && (
          <div className="space-y-1.5">
            <Label>Причина — её увидит компания</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Например: попытки использовать бота для запрещённых товаров" />
          </div>
        )}
        {kind === "plan" && (
          <div className="space-y-1.5">
            <Label>Тариф</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {kind === "extend" && (
          <div className="space-y-1.5">
            <Label>Сколько дней</Label>
            <Input type="number" min={1} max={366} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        )}
        {kind === "messages" && (
          <div className="space-y-1.5">
            <Label>Вернуть сообщений</Label>
            <Input type="number" min={1} value={add} onChange={(e) => setAdd(e.target.value)} />
            <p className="text-xs text-slate-400">
              Сейчас использовано {fmt.format(company.usage.messages_used)}
              {company.usage.messages_limit ? ` из ${fmt.format(company.usage.messages_limit)}` : ""}.
            </p>
          </div>
        )}
        {kind === "delete" && (
          <div className="space-y-1.5">
            <Label>Введите название компании: «{company.name}»</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter className="gap-2">
          {kind === "messages" && (
            <Button variant="outline" disabled={saving} onClick={() => submit({ reset: true })}>
              Обнулить счётчик
            </Button>
          )}
          <Button variant={danger ? "default" : "default"} className={cn(danger && "bg-red-600 hover:bg-red-700")} disabled={disabled} onClick={() => submit()}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {kind === "delete" ? "Удалить навсегда" : kind === "ban" ? "Забанить" : kind === "freeze" ? "Заморозить" : kind === "unblock" ? "Разблокировать" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
