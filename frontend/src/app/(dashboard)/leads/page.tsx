"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardList, Phone, MapPin, Play, RotateCcw, Weight, Package, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloseLeadDialog, type CloseMode } from "@/components/close-lead-dialog";
import { useCurrentUser } from "@/components/current-user";
import { lostReasonLabel, STATUS_LABEL, STATUS_VARIANT } from "@/lib/lead-meta";
import { dayEndISO, dayStartISO, formatDate } from "@/lib/utils";
import type { Lead } from "@/types";

const TABS = [
  { value: "active", label: "Активные" },
  { value: "sold", label: "Продано" },
  { value: "not_sold", label: "Не продано" },
  { value: "all", label: "Все" },
];

const ALL_MANAGERS = "__all__";
const NO_MANAGER = "none";

function isClosed(lead: Lead) {
  return lead.status === "sold" || lead.status === "not_sold";
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const { user, managers, ready } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ lead: Lead; mode: CloseMode } | null>(null);

  const [tab, setTab] = useState("active");
  const [managerFilter, setManagerFilter] = useState(ALL_MANAGERS);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // При быстром переключении фильтров ответ старого запроса не должен затереть новый.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    const params = new URLSearchParams({ status: tab });
    if (managerFilter !== ALL_MANAGERS) params.set("manager", managerFilter);
    if (dateFrom) params.set("from", dayStartISO(dateFrom));
    if (dateTo) params.set("to", dayEndISO(dateTo));
    try {
      const res = await fetch(`/api/leads?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (request !== latestRequest.current) return;
      setLeads(json.data ?? []);
      setError("");
    } catch (e: any) {
      if (request === latestRequest.current) setError(e?.message || "Не удалось загрузить заявки.");
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [tab, managerFilter, dateFrom, dateTo]);

  // Менеджер по умолчанию видит свои заявки, директор — все. Фильтр можно сменить вручную.
  useEffect(() => {
    if (ready) setManagerFilter(user.managerId ?? ALL_MANAGERS);
  }, [ready, user.managerId]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function patchLead(lead: Lead, body: Record<string, unknown>) {
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Не удалось сохранить изменения.");
      else setError("");
      await load();
    } catch {
      setError("Не удалось сохранить изменения. Проверьте соединение.");
    } finally {
      setBusyId(null);
    }
  }

  const hasFilters = managerFilter !== ALL_MANAGERS || dateFrom || dateTo;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Заявки</h1>
        <p className="mt-1 text-sm text-slate-500">
          ИИ собирает данные у клиента, заявка уходит ответственному менеджеру.
        </p>
      </div>

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
            <Label className="text-xs text-slate-500">Менеджер</Label>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MANAGERS}>Все менеджеры</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
                <SelectItem value={NO_MANAGER}>Без ответственного</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Создана с</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">по</Label>
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
              Сбросить
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка...</p>
      ) : leads.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <ClipboardList className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">{hasFilters || tab !== "active" ? "Заявок по этому фильтру нет." : "Заявок пока нет."}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {leads.map((lead) => {
            const busy = busyId === lead.id;
            // Отключённый менеджер остаётся в списке, пока он ответственный за эту заявку.
            const options = managers.filter((m) => m.is_active || m.id === lead.manager_id);
            return (
              <Card key={lead.id} className="flex flex-col">
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{lead.client_name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <Phone className="h-3 w-3" /> {lead.client_phone}
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
                      {lead.collected_data?.weight ?? "не указан вес"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {lead.collected_data?.cargo_type ?? "не указан тип груза"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Ответственный</Label>
                    <Select
                      value={lead.manager_id ?? NO_MANAGER}
                      onValueChange={(v) => patchLead(lead, { manager_id: v === NO_MANAGER ? null : v })}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER}>Не назначен</SelectItem>
                        {options.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isClosed(lead) && (
                    <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p>
                        Закрыл {lead.closed_by ?? "—"}
                        {lead.closed_at ? ` · ${formatDate(lead.closed_at)}` : ""}
                      </p>
                      {lead.status === "not_sold" && <p>Причина: {lostReasonLabel(lead.lost_reason)}</p>}
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
                        Вернуть в работу
                      </Button>
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
                            Взять в работу
                          </Button>
                        )}
                        <Button size="sm" className="flex-1" disabled={busy} onClick={() => setClosing({ lead, mode: "sold" })}>
                          <Check className="h-3.5 w-3.5" />
                          Продано
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={busy}
                          onClick={() => setClosing({ lead, mode: "not_sold" })}
                        >
                          <X className="h-3.5 w-3.5" />
                          Не продано
                        </Button>
                      </div>
                    )}

                    <p className="text-xs text-slate-400">
                      Заявка от {formatDate(lead.created_at)}
                      {lead.source ? ` · ${lead.source.platform === "telegram" ? "Telegram" : "Instagram"}` : ""}
                    </p>
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
          }}
        />
      )}
    </div>
  );
}
