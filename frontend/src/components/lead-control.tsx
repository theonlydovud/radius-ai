"use client";

import { useState } from "react";
import { AlarmClock, CalendarClock, HandCoins, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/components/current-user";
import { costLabel, CURRENCIES, dealLabels, money, offerButtonLabel, priceLabel, typeLabel } from "@/lib/lead-meta";
import { cn, formatDate } from "@/lib/utils";
import type { Currency, Lead } from "@/types";
import { t } from "@/lib/i18n";

/**
 * Контроль работы с заявкой (ТЗ 16.11.2026):
 *   DealFields      — поля блока «Ставка» (вид, ставка клиенту, ставка перевозчика, валюта, маржа);
 *   DealDialog      — «Предложил ставку» / «Изменить ставку»;
 *   NextContactDialog — «Следующий контакт»: дата и что сделать;
 *   OverdueBadges   — «Нет ставки», «Зависла»;
 *   LeadControlInfo — ставка и следующий контакт в карточке.
 */

export type DealValue = { deal_type: string; deal_price: string; deal_cost: string; deal_currency: Currency | "" };

export function dealFromLead(lead: Lead): DealValue {
  return {
    deal_type: lead.deal_type ?? "",
    deal_price: lead.deal_price != null ? String(lead.deal_price) : "",
    deal_cost: lead.deal_cost != null ? String(lead.deal_cost) : "",
    deal_currency: (lead.deal_currency as Currency) ?? "",
  };
}

const num = (v: string) => {
  const n = Number(v.replace(/\s+/g, "").replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : null;
};

/** Блок заполнен: обе ставки, валюта и вид (если у компании есть список видов). */
export function dealComplete(v: DealValue) {
  const types = dealLabels().types;
  return num(v.deal_price) !== null && num(v.deal_cost) !== null && Boolean(v.deal_currency) && (!types.length || types.includes(v.deal_type));
}

export function DealFields({ value, onChange }: { value: DealValue; onChange: (v: DealValue) => void }) {
  const { user } = useCurrentUser();
  const types = dealLabels().types;
  const set = (k: keyof DealValue) => (v: string) => onChange({ ...value, [k]: v });
  const price = num(value.deal_price);
  const cost = num(value.deal_cost);
  // Маржу видит только руководитель.
  const showMargin = user.role === "owner" && price !== null && cost !== null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>
          {typeLabel()}
          {types.length > 0 && " *"}
        </Label>
        {types.length ? (
          <div className="flex flex-wrap gap-1.5">
            {types.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => set("deal_type")(x)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  value.deal_type === x ? "border-brand bg-brand-soft font-medium text-brand" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                {x}
              </button>
            ))}
          </div>
        ) : (
          <Input value={value.deal_type} onChange={(e) => set("deal_type")(e.target.value)} placeholder={t("Необязательно")} />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_110px]">
        <div className="space-y-1.5">
          <Label>{priceLabel()} *</Label>
          <Input inputMode="decimal" value={value.deal_price} onChange={(e) => set("deal_price")(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>{costLabel()} *</Label>
          <Input inputMode="decimal" value={value.deal_cost} onChange={(e) => set("deal_cost")(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("Валюта")} *</Label>
          <Select value={value.deal_currency || undefined} onValueChange={set("deal_currency")}>
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
      {showMargin && (
        <p className={cn("rounded-lg px-3 py-2 text-sm", price! - cost! >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
          {t("Маржа")}: <b>{money(price! - cost!, value.deal_currency || null)}</b>
        </p>
      )}
    </div>
  );
}

async function patchLead(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? t("Не удалось сохранить."));
  return json.data as Lead;
}

/** «Предложил ставку» (mode=offer: заявка переходит на этап «Ставка предложена») или «Изменить ставку». */
export function DealDialog({ lead, mode, onClose, onSaved }: { lead: Lead; mode: "offer" | "edit"; onClose: () => void; onSaved: () => void }) {
  const dealOn = dealLabels().enabled;
  const [value, setValue] = useState<DealValue>(dealFromLead(lead));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ready = !dealOn || dealComplete(value);

  async function submit() {
    if (!ready || saving) return;
    setSaving(true);
    setError("");
    try {
      const deal = dealOn ? { ...value, deal_price: num(value.deal_price), deal_cost: num(value.deal_cost) } : undefined;
      await patchLead(lead.id, mode === "offer" ? { status: "offered", deal } : { deal });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? t("Не удалось сохранить."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "offer" ? offerButtonLabel() : t("Изменить ставку")}</DialogTitle>
          <DialogDescription>{lead.client_name}</DialogDescription>
        </DialogHeader>
        {dealOn ? (
          <DealFields value={value} onChange={setValue} />
        ) : (
          <p className="text-sm text-slate-600">{t("Заявка перейдёт на этап «{0}».", dealLabels().stage_label)}</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("Отмена")}
          </Button>
          <Button size="sm" onClick={submit} disabled={!ready || saving}>
            {saving ? t("Сохранение...") : t("Сохранить")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Следующий контакт»: дата + что сделать. В этот день логисту придёт напоминание. */
export function NextContactDialog({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(lead.next_contact_date ?? "");
  const [note, setNote] = useState(lead.next_contact_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(clear = false) {
    setSaving(true);
    setError("");
    try {
      await patchLead(lead.id, { next_contact: clear ? null : { date, note } });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? t("Не удалось сохранить."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Следующий контакт")}</DialogTitle>
          <DialogDescription>{t("В этот день в начале рабочего дня придёт напоминание в Telegram.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("Дата")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Что сделать")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t("Например, перезвонить по ставке")} />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <DialogFooter>
          {lead.next_contact_date && (
            <Button variant="ghost" size="sm" className="mr-auto text-slate-500" onClick={() => save(true)} disabled={saving}>
              {t("Убрать")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("Отмена")}
          </Button>
          <Button size="sm" onClick={() => save()} disabled={!date || saving}>
            {saving ? t("Сохранение...") : t("Сохранить")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isOverdue(lead: Lead) {
  return Boolean(lead.overdue?.no_offer || lead.overdue?.stuck);
}

export function OverdueBadges({ lead }: { lead: Lead }) {
  if (!isOverdue(lead)) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {lead.overdue?.no_offer && (
        <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
          <AlarmClock className="h-3 w-3" />
          {t("Нет ставки")}
        </span>
      )}
      {lead.overdue?.stuck && (
        <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-300">
          <AlarmClock className="h-3 w-3" />
          {t("Зависла")}
        </span>
      )}
    </span>
  );
}

/** Ставка и следующий контакт в карточке, с кнопками правки (пока заявка не закрыта). */
export function LeadControlInfo({
  lead,
  closed,
  onEditDeal,
  onNextContact,
}: {
  lead: Lead;
  closed: boolean;
  onEditDeal: () => void;
  onNextContact: () => void;
}) {
  const { user } = useCurrentUser();
  const hasDeal = lead.deal_price != null || lead.deal_cost != null;
  const dealOn = dealLabels().enabled;
  if (!hasDeal && !lead.next_contact_date && closed) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {dealOn && hasDeal && (
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-brand-soft/60 px-2.5 py-1.5">
          <HandCoins className="h-3.5 w-3.5 text-brand" />
          {lead.deal_type && <b className="font-semibold text-slate-800">{lead.deal_type}</b>}
          <span>
            {priceLabel()}: <b className="text-slate-800">{money(lead.deal_price, lead.deal_currency)}</b>
          </span>
          <span>
            {costLabel()}: <b className="text-slate-800">{money(lead.deal_cost, lead.deal_currency)}</b>
          </span>
          {user.role === "owner" && lead.margin !== undefined && (
            <span>
              {t("Маржа")}: <b className={lead.margin >= 0 ? "text-emerald-700" : "text-red-600"}>{money(lead.margin, lead.deal_currency)}</b>
            </span>
          )}
          {!closed && (
            <button type="button" onClick={onEditDeal} className="inline-flex items-center gap-1 text-brand hover:underline">
              <Pencil className="h-3 w-3" />
              {t("Изменить")}
            </button>
          )}
        </span>
      )}
      {!closed && (
        <button
          type="button"
          onClick={onNextContact}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-100",
            lead.next_contact_date ? "font-medium text-slate-700" : "text-slate-400"
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {lead.next_contact_date
            ? `${formatDate(lead.next_contact_date).split(",")[0]}${lead.next_contact_note ? ` · ${lead.next_contact_note}` : ""}`
            : t("Следующий контакт")}
        </button>
      )}
    </div>
  );
}
