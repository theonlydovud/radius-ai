"use client";

import { useEffect, useState } from "react";
import { Check, HandCoins, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CompanySettings } from "@/lib/lead-meta";
import { companyTerms, setCompanySettings } from "@/lib/lead-meta";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const DAYS = [
  { value: 1, get label() { return t("Пн"); } },
  { value: 2, get label() { return t("Вт"); } },
  { value: 3, get label() { return t("Ср"); } },
  { value: 4, get label() { return t("Чт"); } },
  { value: 5, get label() { return t("Пт"); } },
  { value: 6, get label() { return t("Сб"); } },
  { value: 0, get label() { return t("Вс"); } },
];

/**
 * «Настройки» → заявки: блок сделки (вкл/выкл, названия полей, список видов),
 * сроки контроля и рабочее время для напоминаний. В тарифе Start блок сделки не включить.
 */
export function DealSettingsCard() {
  const [s, setS] = useState<CompanySettings | null>(null);
  const [available, setAvailable] = useState(true);
  const [deadlinesAvailable, setDeadlinesAvailable] = useState(false);
  const [types, setTypes] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/company", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.data) throw new Error(j.error);
        setS(j.data.settings);
        setAvailable(j.data.deal_available);
        setDeadlinesAvailable(Boolean(j.data.deadlines_available));
        setTypes(j.data.settings.deal.types.join(", "));
      })
      .catch((e) => setNotice({ ok: false, text: e?.message || t("Не удалось загрузить настройки.") }));
  }, []);

  if (!s) {
    return (
      <Card className="mb-6 max-w-2xl p-6 text-sm text-slate-400">{notice ? <span className="text-red-600">{notice.text}</span> : t("Загрузка...")}</Card>
    );
  }

  const setDeal = (patch: Partial<CompanySettings["deal"]>) => setS({ ...s, deal: { ...s.deal, ...patch } });
  const setDl = (k: keyof CompanySettings["deadlines"], v: string) => setS({ ...s, deadlines: { ...s.deadlines, [k]: Number(v) || 0 } });
  const setWork = (patch: Partial<CompanySettings["work"]>) => setS({ ...s, work: { ...s.work, ...patch } });

  async function save() {
    if (!s) return;
    setSaving(true);
    setNotice(null);
    try {
      // Этапы, причины и термины сохраняет карточка «Воронка» — здесь только своё.
      const body = {
        deal: { ...s.deal, types: types.split(",").map((x) => x.trim()).filter(Boolean) },
        deadlines: s.deadlines,
        work: s.work,
        modules: s.modules,
      };
      const res = await fetch("/api/settings/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("Не удалось сохранить."));
      setS(j.data.settings);
      setTypes(j.data.settings.deal.types.join(", "));
      setCompanySettings(j.data.settings);
      setNotice({ ok: true, text: t("Сохранено") });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.message ?? t("Не удалось сохранить.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6 max-w-2xl">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
            <HandCoins className="h-4 w-4 text-brand" />
          </div>
          <div>
            <CardTitle>{t("Блок сделки")}</CardTitle>
            <p className="text-xs text-slate-400">{companyTerms().amount === "rate" ? t("Ставки в карточке заявки: без них нельзя предложить и закрыть «Продано».") : t("Суммы в карточке заявки: без них нельзя отправить предложение и закрыть «Продано».")}</p>
          </div>
        </div>
        <Switch checked={s.deal.enabled} onCheckedChange={(v) => setDeal({ enabled: v })} disabled={!available} />
      </CardHeader>
      <CardContent className="space-y-5">
        {!available && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            {t("Доступно в тарифе Бизнес")}
          </p>
        )}

        <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", !s.deal.enabled && "opacity-60")}>
          <div className="space-y-1.5">
            <Label>{t("Поле «сумма»")}</Label>
            <Input value={s.deal.price_label} onChange={(e) => setDeal({ price_label: e.target.value })} disabled={!s.deal.enabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Поле «себестоимость»")}</Label>
            <Input value={s.deal.cost_label} onChange={(e) => setDeal({ cost_label: e.target.value })} disabled={!s.deal.enabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Поле «вид»")}</Label>
            <Input value={s.deal.type_label} onChange={(e) => setDeal({ type_label: e.target.value })} disabled={!s.deal.enabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Список видов (через запятую)")}</Label>
            <Input value={types} onChange={(e) => setTypes(e.target.value)} placeholder="FTL, LTL, FCL" disabled={!s.deal.enabled} />
          </div>
          {/* Название самого этапа — в карточке «Воронка»; здесь только текст кнопки. */}
          {s.stages?.offered !== null && (
            <div className="space-y-1.5">
              <Label>{t("Кнопка в карточке")}</Label>
              <Input value={s.deal.offer_button} onChange={(e) => setDeal({ offer_button: e.target.value })} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t("Контроль сроков и напоминания")}</p>
              <p className="text-xs text-slate-400">
                {deadlinesAvailable
                  ? t("Метки «Не взята», «Зависла» и напоминания сотрудникам в Telegram.")
                  : t("Нужен, когда в кабинете 2 и больше сотрудников. Доступно в тарифе Бизнес.")}
              </p>
            </div>
            <Switch
              checked={Boolean(s.modules?.deadlines)}
              onCheckedChange={(v) => setS({ ...s, modules: { deadlines: v, partners: s.modules?.partners ?? false } })}
              disabled={!deadlinesAvailable}
            />
          </div>
          <div className={cn("mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3", !s.modules?.deadlines && "hidden")}>
            <div className="space-y-1.5">
              <Label>{t("Не взята в работу, мин")}</Label>
              <Input type="number" min={5} value={s.deadlines.not_taken_minutes} onChange={(e) => setDl("not_taken_minutes", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{companyTerms().amount === "rate" ? t("Нет ставки, часов") : t("Нет предложения, часов")}</Label>
              <Input type="number" min={1} value={s.deadlines.no_offer_hours} onChange={(e) => setDl("no_offer_hours", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Зависла, дней")}</Label>
              <Input type="number" min={1} value={s.deadlines.stuck_days} onChange={(e) => setDl("stuck_days", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Рабочее время")}</p>
          <p className="text-xs text-slate-400">{t("Напоминания приходят только в это время, остальное — в начале следующего рабочего дня.")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {DAYS.map((d) => {
              const on = s.work.days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setWork({ days: on ? s.work.days.filter((x) => x !== d.value) : [...s.work.days, d.value] })}
                  className={cn("h-9 w-11 rounded-lg border text-sm", on ? "border-brand bg-brand-soft font-medium text-brand" : "border-slate-200 text-slate-500")}
                >
                  {d.label}
                </button>
              );
            })}
            <Input type="time" value={s.work.start} onChange={(e) => setWork({ start: e.target.value })} className="ml-2 h-9 w-28" />
            <span className="text-slate-400">—</span>
            <Input type="time" value={s.work.end} onChange={(e) => setWork({ end: e.target.value })} className="h-9 w-28" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("Сохранить")}
          </Button>
          {notice && <span className={cn("text-sm", notice.ok ? "text-emerald-600" : "text-red-600")}>{notice.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
