"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, MessageCircle, Phone, Search, Truck, UserCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadChatSheet } from "@/components/crm/lead-chat-sheet";
import { useCurrentUser } from "@/components/current-user";
import { partnersTitle } from "@/lib/lead-meta";
import { cn, formatDate } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { Lead } from "@/types";

/**
 * База партнёров (у Radius — «Водители»): кого бот распознал как партнёра, а не клиента.
 * Поиск — по машине, направлениям, имени и телефону. Руководитель может вернуть в клиенты,
 * если бот ошибся: тогда это новая заявка в воронке.
 */
export function PartnersList({ canConvert }: { canConvert: boolean }) {
  const { company } = useCurrentUser();
  const cargo = company.lead_kind === "cargo";
  const focusId = useSearchParams().get("lead");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatLead, setChatLead] = useState<Lead | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const params = new URLSearchParams({ kind: "partner", status: "all" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/leads?${params}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setRows(j.data ?? []);
      setError("");
    } catch (e: any) {
      setError(e?.message || t("Не удалось загрузить список."));
    }
  }, []);

  // Поиск — с небольшой задержкой, пока печатают.
  useEffect(() => {
    const id = setTimeout(() => load(query), 250);
    return () => clearTimeout(id);
  }, [query, load]);

  useEffect(() => {
    if (!focusId || !rows) return;
    document.getElementById(`partner-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, rows]);

  async function toClient(lead: Lead) {
    if (!window.confirm(t("Перевести в клиенты? Появится новая заявка в воронке."))) return;
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "client" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error);
      setRows((prev) => prev?.filter((r) => r.id !== lead.id) ?? prev);
    } catch (e: any) {
      setError(e?.message || t("Не удалось сохранить."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={cargo ? t("Поиск: направление, тип машины, телефон") : t("Поиск: что предлагает, направление, телефон")}
          className="pl-9"
        />
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!rows ? (
        <p className="text-sm text-slate-400">{t("Загрузка...")}</p>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <Users className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">{query ? t("Никого не нашли.") : t("{0} пока нет. Бот добавит их сюда сам.", partnersTitle())}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <Card key={p.id} id={`partner-${p.id}`} className={cn("p-3 sm:p-4", focusId === p.id && "ring-2 ring-brand")}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="min-w-0 lg:w-52">
                  <p className="truncate text-sm font-semibold text-slate-900">{p.client_name || "—"}</p>
                  {p.client_phone ? (
                    <a href={`tel:${p.client_phone.replace(/[^\d+]/g, "")}`} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                      <Phone className="h-3.5 w-3.5" />
                      {p.client_phone}
                    </a>
                  ) : (
                    <p className="text-xs text-slate-400">—</p>
                  )}
                  <p className="text-[11px] text-slate-400">{formatDate(p.created_at)}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-700">
                  <p className="flex min-w-0 items-center gap-2">
                    <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">
                      <span className="text-slate-400">{cargo ? t("Машина:") : t("Предлагает:")}</span> {p.collected_data?.partner_offer || "—"}
                    </span>
                  </p>
                  <p className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">
                      <span className="text-slate-400">{t("Направления:")}</span> {p.collected_data?.partner_directions || "—"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 lg:justify-end">
                  {p.session_id && (
                    <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setChatLead(p)}>
                      <MessageCircle className="h-3.5 w-3.5" />
                      {t("Переписка")}
                    </Button>
                  )}
                  {canConvert && (
                    <Button variant="outline" size="sm" disabled={busyId === p.id} onClick={() => toClient(p)}>
                      <UserCheck className="h-3.5 w-3.5" />
                      {t("Это клиент")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <LeadChatSheet lead={chatLead} onClose={() => setChatLead(null)} />
    </div>
  );
}
