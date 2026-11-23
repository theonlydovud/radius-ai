"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/components/current-user";
import { companyTerms, CURRENCIES, dealLabels, lostReasonOptions, STATUS_LABEL } from "@/lib/lead-meta";
import { Input } from "@/components/ui/input";
import { DealFields, dealComplete, dealFromLead, type DealValue } from "@/components/lead-control";
import { cn } from "@/lib/utils";
import type { Currency, Lead, LostReason } from "@/types";
import { t } from "@/lib/i18n";

export type CloseMode = "sold" | "not_sold";

/**
 * Закрытие заявки. «Продано» — с итоговыми ставками, если включён блок сделки (подставлены
 * из «Ставки», можно поправить). «Не продано» — причина обязательна; «Дорого» — цена,
 * которую хотел клиент / цена конкурента; «Другое» — комментарий. «Кто закрывает» — вошедший пользователь; руководитель и супер-админ могут выбрать
 * менеджера, менеджер закрывает только от своего имени (backend это и так проверяет).
 */
export function CloseLeadDialog({
  lead,
  mode,
  onClose,
  onClosed,
}: {
  lead: Lead;
  mode: CloseMode;
  onClose: () => void;
  onClosed: () => void;
}) {
  const { user, managers } = useCurrentUser();
  const [closedBy, setClosedBy] = useState(user.name);
  const [reason, setReason] = useState<LostReason | null>(null);
  const [comment, setComment] = useState("");
  const dealOn = dealLabels().enabled;
  const [deal, setDeal] = useState<DealValue>(dealFromLead(lead));
  const [lostPrice, setLostPrice] = useState("");
  const [lostCurrency, setLostCurrency] = useState<Currency | "">((lead.deal_currency as Currency) ?? "");
  const lostPriceNum = Number(lostPrice.replace(/\s+/g, "").replace(",", "."));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canPick = user.role !== "manager";
  // В списке — руководитель, активные менеджеры и текущий выбор, даже если менеджера уже отключили.
  const names = [...new Set([user.name, ...managers.filter((m) => m.is_active).map((m) => m.name)])];
  if (closedBy && !names.includes(closedBy)) names.push(closedBy);

  const soldReady = !dealOn || dealComplete(deal);
  const lostReady =
    Boolean(reason) &&
    (reason !== "too_expensive" || !dealOn || (lostPrice.trim() !== "" && lostPriceNum > 0 && Boolean(lostCurrency))) &&
    (reason !== "other" || comment.trim().length > 0);
  const canSubmit = Boolean(closedBy) && (mode === "sold" ? soldReady : lostReady) && !saving;
  const toNum = (v: string) => Number(v.replace(/\s+/g, "").replace(",", "."));

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "sold"
            ? {
                status: "sold",
                closed_by: closedBy,
                ...(dealOn ? { deal: { ...deal, deal_price: toNum(deal.deal_price), deal_cost: toNum(deal.deal_cost) } } : {}),
              }
            : {
                status: "not_sold",
                closed_by: closedBy,
                lost_reason: reason,
                lost_comment: comment,
                ...(reason === "too_expensive" && dealOn ? { lost_price: lostPriceNum, lost_currency: lostCurrency } : {}),
              }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? t("Не удалось закрыть заявку."));
        return;
      }
      onClosed();
    } catch {
      setError(t("Не удалось закрыть заявку. Проверьте соединение."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "sold" ? STATUS_LABEL.sold : STATUS_LABEL.not_sold}</DialogTitle>
          <DialogDescription>
            {lead.client_name} · {lead.collected_data?.request ?? `${lead.collected_data?.origin_city ?? "—"} → ${lead.collected_data?.destination_city ?? "—"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canPick && (
          <div className="space-y-1.5">
            <Label>{t("Кто закрывает")}</Label>
            <Select value={closedBy || undefined} onValueChange={setClosedBy}>
              <SelectTrigger>
                <SelectValue placeholder={t("Выберите менеджера")} />
              </SelectTrigger>
              <SelectContent>
                {names.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          )}

          {mode === "sold" && dealOn && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-600">{companyTerms().amount === "rate" ? t("Итоговые ставки") : t("Итоговые суммы")}</p>
              <DealFields value={deal} onChange={setDeal} />
            </div>
          )}

          {mode === "not_sold" && (
            <>
              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 text-xs font-medium text-slate-600">{t("Причина")}</legend>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {lostReasonOptions().map((r) => (
                    <label
                      key={r.value}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50",
                        reason === r.value && "border-brand bg-brand-soft"
                      )}
                    >
                      <input
                        type="radio"
                        name="lost-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="accent-brand"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {reason === "too_expensive" && dealOn && (
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("Цена, которую хотел клиент / цена конкурента")} *</Label>
                    <Input inputMode="decimal" value={lostPrice} onChange={(e) => setLostPrice(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("Валюта")} *</Label>
                    <Select value={lostCurrency || undefined} onValueChange={(v) => setLostCurrency(v as Currency)}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{reason === "other" ? `${t("Комментарий")} *` : t("Комментарий (необязательно)")}</Label>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-[64px]" />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("Отмена")}</Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit}>
            {saving ? t("Сохранение...") : t("Закрыть заявку")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
