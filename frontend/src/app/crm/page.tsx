"use client";

import { isGenericLead, LeadRequest } from "@/components/lead-request";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Weight,
  X,
} from "lucide-react";
import { hasFeature, useCurrentUser } from "@/components/current-user";
import { CloseLeadDialog, type CloseMode } from "@/components/close-lead-dialog";
import { CreateLeadButton } from "@/components/create-lead-dialog";
import { SERIES } from "@/components/crm/charts";
import { StatsSection } from "@/components/crm/stats-section";
import { greeting, plural, TopBar } from "@/components/crm/top-bar";
import { LeadChatSheet } from "@/components/crm/lead-chat-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasStage, leadFlow, lostReasonLabel, money, offerButtonLabel, partnerLabel, partnersOn, partnersTitle, STATUS_LABEL, STATUS_VARIANT } from "@/lib/lead-meta";
import { PartnersList } from "@/components/partners-list";
import { Suspense } from "react";
import { Truck } from "lucide-react";
import { DealDialog, isOverdue, LeadControlInfo, NextContactDialog, OverdueBadges } from "@/components/lead-control";
import { HandCoins } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Lead } from "@/types";
import { t as tr } from "@/lib/i18n";
import { PlatformBanner } from "@/components/platform-banner";

const REFRESH_MS = 30_000;

type LeadTab = "active" | "offered" | "overdue" | "sold" | "not_sold" | "all";
const LEAD_TABS: { value: LeadTab; label: string }[] = [
  { value: "active", get label() { return tr("Активные"); } },
  { value: "offered", get label() { return STATUS_LABEL.offered; } },
  { value: "overdue", get label() { return tr("Просроченные"); } },
  { value: "sold", get label() { return STATUS_LABEL.sold; } },
  { value: "not_sold", get label() { return STATUS_LABEL.not_sold; } },
  { value: "all", get label() { return tr("Все"); } },
];

function inTab(lead: Lead, tab: LeadTab) {
  if (tab === "all") return true;
  if (tab === "active") return lead.status === "new" || lead.status === "in_progress" || lead.status === "offered";
  if (tab === "overdue") return isOverdue(lead);
  return lead.status === tab;
}

function isClosed(lead: Lead) {
  return lead.status === "sold" || lead.status === "not_sold";
}

function ago(iso: string) {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return tr("только что");
  if (min < 60) return tr("{0} мин назад", min);
  const h = Math.floor(min / 60);
  if (h < 24) return tr("{0} ч назад", h);
  return formatDate(iso);
}

// ---------------------------------------------------------------------

function LeadRow({
  lead,
  focused,
  busy,
  onPatch,
  onClose,
  onChat,
  onOffer,
  onEditDeal,
  onNextContact,
}: {
  lead: Lead;
  focused: boolean;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onClose: (mode: CloseMode) => void;
  onChat: () => void;
  onOffer: () => void;
  onEditDeal: () => void;
  onNextContact: () => void;
}) {
  const d = lead.collected_data;
  const origin = d?.origin_city?.trim();
  const destination = d?.destination_city?.trim();
  const weight = d?.weight?.trim();
  const cargo = d?.cargo_type?.trim();
  // Экран менеджера: в компании 2+ сотрудника, поэтому «Взять в работу» есть.
  const flow = leadFlow(lead.status, false);
  return (
    <Card
      id={`lead-${lead.id}`}
      className={cn(
        "relative overflow-hidden p-5 transition-shadow hover:shadow-md",
        focused && "ring-2 ring-brand",
        lead.status === "new" && "border-[#eda100]/40",
        isOverdue(lead) && "border-red-300 bg-red-50/40 dark:bg-red-500/5"
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: SERIES[lead.status].color }}
      />
      <div className="grid gap-4 md:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] md:items-stretch">
        <div className="min-w-0 rounded-xl border border-slate-100 bg-white px-4 py-3 md:border-0 md:border-r md:bg-transparent md:px-0 md:pr-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 break-words text-[15px] font-semibold leading-5 text-slate-900">{lead.client_name}</p>
            <Badge variant={STATUS_VARIANT[lead.status]} className="shrink-0">
              {STATUS_LABEL[lead.status]}
            </Badge>
          </div>
          <a href={`tel:${lead.client_phone.replace(/[^\d+]/g, "")}`} className="mt-2 inline-flex items-center gap-2 rounded-md text-sm font-medium text-brand hover:underline">
            <Phone className="h-4 w-4" />
            {lead.client_phone}
          </a>
          <OverdueBadges lead={lead} />
          <p className="mt-1.5 text-xs text-slate-400">
            {ago(lead.created_at)}
            {d?.created_by ? tr(" · вручную, {0}", d.created_by) : ""}
          </p>
        </div>

        {isGenericLead(d) ? (
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Запрос")}</p>
            <LeadRequest d={d} className="leading-5" />
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                {tr("Маршрут")}
              </p>
              <p className="break-words text-sm font-semibold leading-5 text-slate-800">
                {origin || "—"} <span className="px-1 text-slate-400">→</span> {destination || "—"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Weight className="h-3.5 w-3.5" />
                {tr("Вес / объём")}
              </p>
              <p className="break-words text-sm font-semibold leading-5 text-slate-800">
                {weight || tr("не указан")}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Package className="h-3.5 w-3.5" />
                {tr("Тип груза")}
              </p>
              <p className="break-words text-sm font-semibold leading-5 text-slate-800">
                {cargo || tr("не указан")}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {lead.session_id && (
          <Button variant="ghost" size="sm" onClick={onChat} className="mr-auto text-slate-600">
            <MessageCircle className="h-3.5 w-3.5" />
            {tr("Переписка")}</Button>
        )}
        {partnersOn() && !isClosed(lead) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500"
            disabled={busy}
            onClick={() => window.confirm(tr("Это {0}, а не клиент? Заявка уйдёт из воронки в «{1}».", partnerLabel().toLowerCase(), partnersTitle())) && onPatch({ kind: "partner" })}
          >
            <Truck className="h-3.5 w-3.5" />
            {tr("Это {0}", partnerLabel().toLowerCase())}</Button>
        )}
        {isClosed(lead) ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onPatch({ status: flow.reopenTo })}>
            <RotateCcw className="h-3.5 w-3.5" />
            {flow.reopenLabel}</Button>
        ) : (
          <>
            {flow.take && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onPatch({ status: "in_progress" })}>
                <Play className="h-3.5 w-3.5" />
                {flow.takeLabel}</Button>
            )}
            {flow.offer && (
              <Button variant="outline" size="sm" disabled={busy} onClick={onOffer}>
                <HandCoins className="h-3.5 w-3.5" />
                {offerButtonLabel()}</Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => onClose("sold")}>
              <Check className="h-3.5 w-3.5" />
              {STATUS_LABEL.sold}</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onClose("not_sold")}>
              <X className="h-3.5 w-3.5" />
              {STATUS_LABEL.not_sold}</Button>
          </>
        )}
      </div>

      {d?.note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-slate-700">💬 {d.note}</p>}
      <LeadControlInfo lead={lead} closed={isClosed(lead)} onEditDeal={onEditDeal} onNextContact={onNextContact} />

      {isClosed(lead) && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {lead.status === "sold" ? STATUS_LABEL.sold : `${STATUS_LABEL.not_sold} · ${lostReasonLabel(lead.lost_reason)}`}
          {lead.closed_at ? ` · ${formatDate(lead.closed_at)}` : ""}
          {lead.lost_reason === "too_expensive" && lead.lost_price != null ? ` · ${tr("Цена клиента / конкурента:")} ${money(lead.lost_price, lead.lost_currency)}` : ""}
          {lead.lost_comment ? ` · ${lead.lost_comment}` : ""}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------

export default function CrmPage() {
  const { user, company } = useCurrentUser();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsError, setLeadsError] = useState("");
  const [tab, setTab] = useState<LeadTab>("active");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ lead: Lead; mode: CloseMode } | null>(null);
  const [chatLead, setChatLead] = useState<Lead | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dealFor, setDealFor] = useState<{ lead: Lead; mode: "offer" | "edit" } | null>(null);
  const [contactFor, setContactFor] = useState<Lead | null>(null);

  const [statsKey, setStatsKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads?status=all", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLeads(json.data ?? []);
      setLeadsError("");
    } catch (e: any) {
      setLeadsError(e?.message || tr("Не удалось загрузить заявки."));
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setStatsKey((k) => k + 1);
    await loadLeads();
    setRefreshing(false);
  }, [loadLeads]);

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

  // Новые заявки появляются сами: опрос раз в 30 с, пока вкладка открыта.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadLeads();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadLeads]);

  useEffect(() => {
    if (focusId && leads) document.getElementById(`lead-${focusId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, leads]);

  const counts = useMemo(() => {
    const all = leads ?? [];
    return {
      active: all.filter((l) => inTab(l, "active")).length,
      offered: all.filter((l) => l.status === "offered").length,
      overdue: all.filter((l) => isOverdue(l)).length,
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
        return [l.client_name, l.client_phone, d.origin_city, d.destination_city, d.cargo_type, d.weight, d.request]
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
      setLeadsError(res.ok ? "" : json.error ?? tr("Не удалось сохранить изменения."));
      await refresh();
    } catch {
      setLeadsError(tr("Не удалось сохранить изменения. Проверьте соединение."));
    } finally {
      setBusyId(null);
    }
  }

  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="min-h-screen bg-background">
      <PlatformBanner />
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
                  <span className="font-medium text-slate-900">{counts.new}</span> {plural(counts.new, tr("новая заявка ждёт"), tr("новые заявки ждут"), tr("новых заявок ждут"))} {" "}{tr("вас ·")}{" "}
                </>
              ) : (
                tr("Новых заявок нет · ")
              )}
              {tr("в работе:")}{" "}<span className="font-medium text-slate-900">{counts.in_progress}</span>
            </p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <CreateLeadButton onCreated={refresh} />
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {tr("Обновить")}</Button>
          </div>
        </div>

        {/* Заявки */}
        <section className="mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={tab} onValueChange={(v) => setTab(v as LeadTab)} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <TabsList className="inline-flex w-max md:w-auto">
                {LEAD_TABS.filter((t) => (t.value !== "offered" || hasStage("offered")) && (t.value !== "overdue" || company?.settings?.modules?.deadlines !== false)).map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="flex-none gap-1.5 whitespace-nowrap px-3">
                    {t.label}
                    <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] tabular-nums text-slate-600">{counts[t.value]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={company.lead_kind === "cargo" ? tr("Имя, телефон, город, груз") : tr("Имя, телефон, что хочет клиент")} className="h-9 pl-9" />
            </div>
          </div>

          {leadsError && <p className="mt-3 text-sm text-red-600">{leadsError}</p>}

          <div className="mt-4 space-y-3">
            {!leads ? (
              [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface/70" />)
            ) : visible.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 p-10 text-center">
                <ClipboardList className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {query ? tr("Ничего не найдено.") : tab === "active" ? tr("Активных заявок нет. Новые появятся здесь сами.") : tr("Заявок здесь пока нет.")}
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
                  onOffer={() => setDealFor({ lead, mode: "offer" })}
                  onEditDeal={() => setDealFor({ lead, mode: "edit" })}
                  onNextContact={() => setContactFor(lead)}
                />
              ))
            )}
          </div>
        </section>

        {/* База водителей (партнёров) — общая для компании: логист ищет машину под груз. */}
        {partnersOn() && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <Truck className="h-4 w-4 text-slate-400" />
              {partnersTitle()}
            </h2>
            <Suspense>
              <PartnersList canConvert={false} />
            </Suspense>
          </section>
        )}

        {hasFeature(company, "stats") && <StatsSection title={tr("Мои показатели")} splitHint={tr("Где сейчас ваши заявки")} refreshKey={statsKey} />}
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
      {dealFor && (
        <DealDialog
          lead={dealFor.lead}
          mode={dealFor.mode}
          onClose={() => setDealFor(null)}
          onSaved={() => {
            setDealFor(null);
            refresh();
          }}
        />
      )}
      {contactFor && (
        <NextContactDialog
          lead={contactFor}
          onClose={() => setContactFor(null)}
          onSaved={() => {
            setContactFor(null);
            loadLeads();
          }}
        />
      )}
      <LeadChatSheet lead={chatLead} onClose={() => setChatLead(null)} />
    </div>
  );
}
