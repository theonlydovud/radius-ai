"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardList, MessageCircle, Phone, MapPin, Play, RotateCcw, Weight, Package, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloseLeadDialog, type CloseMode } from "@/components/close-lead-dialog";
import { LeadChatSheet } from "@/components/crm/lead-chat-sheet";
import { useAccountId } from "@/components/account-switcher";
import { useCurrentUser } from "@/components/current-user";
import { lostReasonLabel, STATUS_LABEL, STATUS_VARIANT } from "@/lib/lead-meta";
import { cn, dayEndISO, dayStartISO, formatDate } from "@/lib/utils";
import type { Lead } from "@/types";
import { t as tr } from "@/lib/i18n";

const TABS = [
  { value: "active", get label() { return tr("Активные"); } },
  { value: "sold", get label() { return tr("Продано"); } },
  { value: "not_sold", get label() { return tr("Не продано"); } },
  { value: "all", get label() { return tr("Все"); } },
];

const ALL_MANAGERS = "__all__";
const NO_MANAGER = "none";

const REFRESH_MS = 30_000;

function isClosed(lead: Lead) {
  return lead.status === "sold" || lead.status === "not_sold";
}

/**
 * Заявки с фильтрами: вкладки, менеджер, даты. Общая для панели руководителя (карточки)
 * и страницы супер-админа (список). onChanged — после любого действия (чтобы обновить статистику рядом).
 */
const LIVE_REFRESH_MS = 5_000;

export function LeadsBoard({
  onChanged,
  layout = "cards",
  live = false,
  onNewLead,
}: {
  onChanged?: () => void;
  layout?: "cards" | "list";
  /** Экран на стене: опрос каждые 5 с, новые заявки подсвечиваются и передаются в onNewLead. */
  live?: boolean;
  onNewLead?: (lead: Lead) => void;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  // Live: какие заявки уже видели и какие только что пришли (для анимации).
  const seenRef = useRef<Set<string> | null>(null);
  const openedAt = useRef(Date.now());
  const onNewLeadRef = useRef(onNewLead);
  onNewLeadRef.current = onNewLead;
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const { user, managers, ready } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ lead: Lead; mode: CloseMode } | null>(null);
  const [chatLead, setChatLead] = useState<Lead | null>(null);

  // Ссылка из Telegram: /leads?lead=<id> — показываем все заявки и подсвечиваем эту.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [tab, setTab] = useState("active");
  const [managerFilter, setManagerFilter] = useState(ALL_MANAGERS);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // При быстром переключении фильтров ответ старого запроса не должен затереть новый.
  const latestRequest = useRef(0);
  // Панель руководителя: заявки выбранного Instagram-аккаунта (undefined — список аккаунтов ещё грузится).
  const accountId = useAccountId();

  const load = useCallback(async () => {
    if (accountId === undefined) return;
    const request = ++latestRequest.current;
    const params = new URLSearchParams({ status: tab });
    if (accountId) params.set("account", accountId);
    if (managerFilter !== ALL_MANAGERS) params.set("manager", managerFilter);
    if (dateFrom) params.set("from", dayStartISO(dateFrom));
    if (dateTo) params.set("to", dayEndISO(dateTo));
    try {
      const res = await fetch(`/api/leads?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (request !== latestRequest.current) return;
      const list: Lead[] = json.data ?? [];
      setLeads(list);
      setError("");
      if (live) {
        if (!seenRef.current) seenRef.current = new Set(list.map((l) => l.id));
        else {
          // Новая = ещё не видели, статус «Новая» и создана после открытия страницы
          // (переключение фильтров не должно вызывать «новые» заявки).
          const arrived = list.filter((l) => !seenRef.current!.has(l.id) && l.status === "new" && Date.parse(l.created_at) >= openedAt.current - 60_000);
          list.forEach((l) => seenRef.current!.add(l.id));
          if (arrived.length) {
            const ids = arrived.map((l) => l.id);
            setFreshIds((prev) => new Set([...prev, ...ids]));
            setTimeout(() => setFreshIds((prev) => new Set([...prev].filter((id) => !ids.includes(id)))), 15_000);
            onNewLeadRef.current?.(arrived[0]);
          }
        }
      }
    } catch (e: any) {
      if (request === latestRequest.current) setError(e?.message || tr("Не удалось загрузить заявки."));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [tab, managerFilter, dateFrom, dateTo, accountId, live]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lead");
    if (id) {
      setFocusId(id);
      setTab("all");
    }
  }, []);

  // Менеджер по умолчанию видит свои заявки, директор — все. Фильтр можно сменить вручную.
  // По ссылке на конкретную заявку фильтр не ставим, иначе она может не попасть в список.
  useEffect(() => {
    if (ready && !new URLSearchParams(window.location.search).get("lead")) {
      setManagerFilter(user.managerId ?? ALL_MANAGERS);
    }
  }, [ready, user.managerId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // Новые заявки появляются сами, пока вкладка открыта.
  useEffect(() => {
    if (!ready) return;
    // Экран на стене опрашивает часто и даже в фоне; обычная вкладка — раз в 30 с, только когда видна.
    const timer = setInterval(() => (live || document.visibilityState === "visible") && load(), live ? LIVE_REFRESH_MS : REFRESH_MS);
    return () => clearInterval(timer);
  }, [ready, load, live]);

  useEffect(() => {
    if (focusId && !loading) document.getElementById(`lead-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, loading, leads]);

  async function patchLead(lead: Lead, body: Record<string, unknown>) {
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? tr("Не удалось сохранить изменения."));
      else setError("");
      await load();
      onChanged?.();
    } catch {
      setError(tr("Не удалось сохранить изменения. Проверьте соединение."));
    } finally {
      setBusyId(null);
    }
  }

  const hasFilters = managerFilter !== ALL_MANAGERS || dateFrom || dateTo;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex w-full sm:inline-flex sm:w-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1 px-2 sm:flex-none sm:px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
          <div className="col-span-2 space-y-1 sm:w-48">
            <Label className="text-xs text-slate-500">{tr("Менеджер")}</Label>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MANAGERS}>{tr("Все менеджеры")}</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
                <SelectItem value={NO_MANAGER}>{tr("Без ответственного")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">{tr("Создана с")}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">{tr("по")}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
          </div>
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              className="col-span-2 h-9 sm:col-auto"
              onClick={() => {
                setManagerFilter(ALL_MANAGERS);
                setDateFrom("");
                setDateTo("");
              }}
            >
              {tr("Сбросить")}</Button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">{tr("Загрузка...")}</p>
      ) : leads.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <ClipboardList className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">{hasFilters || tab !== "active" ? tr("Заявок по этому фильтру нет.") : tr("Заявок пока нет.")}</p>
        </Card>
      ) : layout === "list" ? (
        <div className="space-y-2">
          {leads.map((lead) => {
            const busy = busyId === lead.id;
            const options = managers.filter((m) => m.is_active || m.id === lead.manager_id);
            const d = lead.collected_data;
            return (
              <Card key={lead.id} id={`lead-${lead.id}`} className={cn("p-3 sm:p-4", focusId === lead.id && "ring-2 ring-brand", freshIds.has(lead.id) && "lead-arrive")}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="min-w-0 lg:w-52">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{lead.client_name}</p>
                      <Badge variant={STATUS_VARIANT[lead.status]} className="shrink-0">
                        {STATUS_LABEL[lead.status]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" /> {lead.client_phone || "—"}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(lead.created_at)}
                      {d?.created_by ? tr(" · вручную, {0}", d.created_by) : ""}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                    <p className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{d?.origin_city ?? "—"} → {d?.destination_city ?? "—"}</span>
                    </p>
                    <p className="flex min-w-0 items-center gap-2 text-slate-500">
                      <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{[d?.weight, d?.cargo_type].filter(Boolean).join(" · ") || tr("груз не указан")}</span>
                    </p>
                  </div>

                  <Select value={lead.manager_id ?? NO_MANAGER} onValueChange={(v) => patchLead(lead, { manager_id: v === NO_MANAGER ? null : v })} disabled={busy}>
                    <SelectTrigger className="h-8 text-xs lg:w-36" aria-label={tr("Ответственный")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MANAGER}>{tr("Не назначен")}</SelectItem>
                      {options.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap lg:justify-end">
                    {lead.session_id && (
                      <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setChatLead(lead)}>
                        <MessageCircle className="h-3.5 w-3.5" />
                        {tr("Переписка")}</Button>
                    )}
                    {isClosed(lead) ? (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => patchLead(lead, { status: "in_progress" })}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        {tr("Вернуть")}</Button>
                    ) : (
                      <>
                        {lead.status === "new" && (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => patchLead(lead, { status: "in_progress" })}>
                            <Play className="h-3.5 w-3.5" />
                            {tr("Взять")}</Button>
                        )}
                        <Button size="sm" disabled={busy} onClick={() => setClosing({ lead, mode: "sold" })}>
                          <Check className="h-3.5 w-3.5" />
                          {tr("Продано")}</Button>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => setClosing({ lead, mode: "not_sold" })}>
                          <X className="h-3.5 w-3.5" />
                          {tr("Не продано")}</Button>
                      </>
                    )}
                  </div>
                </div>

                {d?.note && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-amber-50/60 px-3 py-1.5 text-xs text-slate-700">💬 {d.note}</p>}
                {(isClosed(lead) || (lead.taken_by && lead.taken_at)) && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                    {isClosed(lead) &&
                      tr("{0} · закрыл {1}{2}{3}", lead.status === "sold" ? tr("Продано") : `${tr("Не продано")} · ${lostReasonLabel(lead.lost_reason)}`, lead.closed_by ?? "—", lead.closed_at ? ` · ${formatDate(lead.closed_at)}` : "", lead.lost_comment ? ` · ${lead.lost_comment}` : "")}
                    {!isClosed(lead) && lead.taken_by && lead.taken_at && tr("✅ Взял в Telegram: {0} · {1}", lead.taken_by, formatDate(lead.taken_at))}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {leads.map((lead) => {
            const busy = busyId === lead.id;
            // Отключённый менеджер остаётся в списке, пока он ответственный за эту заявку.
            const options = managers.filter((m) => m.is_active || m.id === lead.manager_id);
            return (
              <Card
                key={lead.id}
                id={`lead-${lead.id}`}
                className={cn("flex flex-col", focusId === lead.id && "ring-2 ring-brand", freshIds.has(lead.id) && "lead-arrive")}
              >
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{lead.client_name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <Phone className="h-3 w-3" /> {lead.client_phone || "—"}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[lead.status]} className="shrink-0">
                    {STATUS_LABEL[lead.status]}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="space-y-1.5 text-sm text-slate-600">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {lead.collected_data?.origin_city ?? "—"} → {lead.collected_data?.destination_city ?? "—"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Weight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {lead.collected_data?.weight ?? tr("не указан вес")}
                    </p>
                    <p className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {lead.collected_data?.cargo_type ?? tr("не указан тип груза")}
                    </p>
                    {lead.collected_data?.note && (
                      <p className="whitespace-pre-wrap break-words rounded-lg bg-amber-50/60 px-2.5 py-1.5 text-xs text-slate-700">💬 {lead.collected_data.note}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">{tr("Ответственный")}</Label>
                    <Select
                      value={lead.manager_id ?? NO_MANAGER}
                      onValueChange={(v) => patchLead(lead, { manager_id: v === NO_MANAGER ? null : v })}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER}>{tr("Не назначен")}</SelectItem>
                        {options.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {lead.taken_by && lead.taken_at && (
                    <p className="text-xs text-slate-500">
                      {tr("✅ Взял в Telegram:")}{" "}{lead.taken_by} · {formatDate(lead.taken_at)}
                    </p>
                  )}

                  {isClosed(lead) && (
                    <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p>
                        {tr("Закрыл")}{" "}{lead.closed_by ?? "—"}
                        {lead.closed_at ? ` · ${formatDate(lead.closed_at)}` : ""}
                      </p>
                      {lead.status === "not_sold" && <p>{tr("Причина:")}{" "}{lostReasonLabel(lead.lost_reason)}</p>}
                      {lead.lost_comment && <p className="whitespace-pre-wrap break-words">{lead.lost_comment}</p>}
                    </div>
                  )}

                  <div className="mt-auto space-y-3 pt-1">
                    {isClosed(lead) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={busy}
                        onClick={() => patchLead(lead, { status: "in_progress" })}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {tr("Вернуть в работу")}</Button>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {lead.status === "new" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={busy}
                            onClick={() => patchLead(lead, { status: "in_progress" })}
                          >
                            <Play className="h-3.5 w-3.5" />
                            {tr("Взять в работу")}</Button>
                        )}
                        <Button size="sm" className="flex-1" disabled={busy} onClick={() => setClosing({ lead, mode: "sold" })}>
                          <Check className="h-3.5 w-3.5" />
                          {tr("Продано")}</Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={busy}
                          onClick={() => setClosing({ lead, mode: "not_sold" })}
                        >
                          <X className="h-3.5 w-3.5" />
                          {tr("Не продано")}</Button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">
                      {tr("Заявка от")}{" "}{formatDate(lead.created_at)}
                      {lead.source ? ` · ${lead.source.platform === "telegram" ? "Telegram" : "Instagram"}` : ""}
                      {lead.collected_data?.created_by ? tr(" · вручную, {0}", lead.collected_data.created_by) : ""}
                    </p>
                    {lead.session_id && (
                    <button
                      type="button"
                      onClick={() => setChatLead(lead)}
                      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {tr("Переписка")}</button>
                    )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {closing && (
        <CloseLeadDialog
          lead={closing.lead}
          mode={closing.mode}
          onClose={() => setClosing(null)}
          onClosed={() => {
            setClosing(null);
            load();
            onChanged?.();
          }}
        />
      )}
      <LeadChatSheet lead={chatLead} onClose={() => setChatLead(null)} />
    </div>
  );
}
