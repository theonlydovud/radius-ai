"use client";

import { useEffect, useState } from "react";
import { Check, GitBranch, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCurrentUser } from "@/components/current-user";
import {
  BUILTIN_REASONS,
  CUSTOM_REASON_PREFIX,
  lostReasonLabel,
  STAGE_KEYS,
  STAGE_TYPE,
  TEMPLATE_CHOICES,
  CUSTOM_B2B,
  TERM_CHOICES,
  type CompanySettings,
  type Stages,
  type Template,
  type Terms,
} from "@/lib/lead-meta";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const TYPE_LABEL = {
  get open() { return t("в работе"); },
  get success() { return t("успех"); },
  get fail() { return t("отказ"); },
};

/** Сохранить настройки компании; ответ — новые настройки. */
export async function saveCompanySettings(body: Record<string, unknown>): Promise<CompanySettings> {
  const res = await fetch("/api/settings/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? t("Не удалось сохранить."));
  return j.data.settings;
}

/**
 * «Настройки» → «Воронка»: шаблон бизнеса, названия этапов (этап 1 — только переименовать),
 * причины отказа и термины интерфейса.
 */
export function FunnelSettingsCard() {
  const { updateSettings } = useCurrentUser();
  const [s, setS] = useState<CompanySettings | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"template" | "save" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Свежие настройки прямо из базы (не из сессии): иначе после сохранения могли показаться
  // старые, и следующее «Сохранить» записывало их поверх новых.
  useEffect(() => {
    fetch("/api/settings/company", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.data?.settings && setS(j.data.settings))
      .catch(() => setNotice({ ok: false, text: t("Не удалось загрузить настройки.") }));
  }, []);

  // Старый backend без воронки — карточку не показываем.
  if (!s?.stages || !s.terms || !s.lost_reasons) return null;
  const stages = s.stages;
  const reasons = s.lost_reasons;

  async function chooseTemplate(template: Template) {
    if (template === s?.template) return;
    if (s?.template && !window.confirm(t("Этапы, причины отказа и термины заменятся на шаблонные. Заявки останутся на месте. Продолжить?"))) return;
    setBusy("template");
    setNotice(null);
    try {
      const next = await saveCompanySettings({ template });
      setS(next);
      updateSettings(next);
      setNotice({ ok: true, text: t("Шаблон применён") });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.message ?? t("Не удалось сохранить.") });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!s) return;
    setBusy("save");
    setNotice(null);
    try {
      const next = await saveCompanySettings({
        stages: s.stages,
        lost_reasons: s.lost_reasons,
        terms: s.terms,
        modules: { deadlines: s.modules?.deadlines ?? false, partners: s.modules?.partners ?? false },
        partners: s.partners,
      });
      setS(next);
      updateSettings(next);
      setNotice({ ok: true, text: t("Сохранено") });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.message ?? t("Не удалось сохранить.") });
    } finally {
      setBusy(null);
    }
  }

  const setStage = (key: keyof Stages, value: string) => setS({ ...s, stages: { ...stages, [key]: value } });
  const setTerm = <K extends keyof Terms>(key: K, value: Terms[K]) => setS({ ...s, terms: { ...s.terms!, [key]: value } });
  const setReasons = (list: string[]) => setS({ ...s, lost_reasons: list });
  const addable = BUILTIN_REASONS.filter((r) => !reasons.includes(r));

  function addCustom() {
    const text = custom.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!text) return;
    const code = `${CUSTOM_REASON_PREFIX}${text}`;
    if (!reasons.includes(code)) setReasons([...reasons.filter((r) => r !== "other"), code, "other"]);
    setCustom("");
  }

  return (
    <Card className="mb-6 max-w-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
          <GitBranch className="h-4 w-4 text-brand" />
        </div>
        <div>
          <CardTitle>{t("Воронка")}</CardTitle>
          <p className="text-xs text-slate-400">{t("Этапы заявки, причины отказа и как называть заявки и сотрудников.")}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Шаблон */}
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Шаблон бизнеса")}</p>
          {/* Индивидуальная воронка (Radius) в выборе нет — показываем её как текущую. */}
          {s.template === "b2b" && (
            <div className="mt-2 rounded-xl border border-brand bg-brand-soft p-3">
              <p className="text-sm font-semibold text-slate-900">{CUSTOM_B2B.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{CUSTOM_B2B.stages.join(" → ")}</p>
            </div>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TEMPLATE_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={busy !== null}
                onClick={() => chooseTemplate(c.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                  s.template === c.value ? "border-brand bg-brand-soft" : "border-slate-200 hover:border-slate-300"
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.stages.join(" → ")}</p>
              </button>
            ))}
          </div>
          {!s.template && <p className="mt-2 text-xs text-slate-400">{t("Шаблон не выбран — работает стандартная воронка.")}</p>}
        </div>

        {/* Этапы */}
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Этапы")}</p>
          <p className="text-xs text-slate-400">{t("Можно переименовать. Статистика считается по типу этапа, поэтому новые названия её не ломают.")}</p>
          <div className="mt-2 space-y-2">
            {STAGE_KEYS.filter((k) => stages[k] !== null).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <Input value={t(stages[k] as string)} onChange={(e) => setStage(k, e.target.value)} maxLength={40} className="h-9" />
                <span
                  className={cn(
                    "w-20 shrink-0 rounded-md px-2 py-1 text-center text-[11px]",
                    STAGE_TYPE[k] === "success" ? "bg-emerald-50 text-emerald-700" : STAGE_TYPE[k] === "fail" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {TYPE_LABEL[STAGE_TYPE[k]]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Причины отказа */}
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Причины отказа")}</p>
          <p className="text-xs text-slate-400">{t("Без причины заявку не закрыть «{0}». «Другое» — всегда с комментарием.", t(stages.not_sold))}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-xs text-slate-700">
                {lostReasonLabel(r)}
                {r !== "other" && (
                  <button type="button" onClick={() => setReasons(reasons.filter((x) => x !== r))} className="rounded-full p-0.5 hover:bg-slate-200" aria-label={t("Убрать")}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            {addable.length > 0 && (
              <Select value="" onValueChange={(v) => setReasons([...reasons.filter((x) => x !== "other"), v, "other"])}>
                <SelectTrigger className="h-9 sm:w-56">
                  <SelectValue placeholder={t("Добавить из списка")} />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((r) => (
                    <SelectItem key={r} value={r}>
                      {lostReasonLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex flex-1 gap-2">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} placeholder={t("Своя причина")} maxLength={60} className="h-9" />
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={addCustom} disabled={!custom.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Партнёры (водители) */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t("Принимать контакты партнёров")}</p>
              <p className="text-xs text-slate-400">
                {t("Бот распознаёт тех, кто сам предлагает услуги (например, водитель ищет груз), и отправляет в группу без ответственного. В заявки и статистику они не попадают.")}
              </p>
            </div>
            <Switch checked={Boolean(s.modules?.partners)} onCheckedChange={(v) => setS({ ...s, modules: { deadlines: s.modules?.deadlines ?? false, partners: v } })} />
          </div>
          {s.modules?.partners && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("Название — один")}</Label>
                <Input
                  value={s.partners?.label ?? ""}
                  onChange={(e) => setS({ ...s, partners: { label: e.target.value, label_many: s.partners?.label_many ?? "" } })}
                  placeholder={t("Водитель, Поставщик, Партнёр")}
                  maxLength={30}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Название — много (меню)")}</Label>
                <Input
                  value={s.partners?.label_many ?? ""}
                  onChange={(e) => setS({ ...s, partners: { label: s.partners?.label ?? "", label_many: e.target.value } })}
                  placeholder={t("Водители, Поставщики, Партнёры")}
                  maxLength={30}
                  className="h-9"
                />
              </div>
            </div>
          )}
        </div>

        {/* Термины */}
        <div>
          <p className="text-sm font-semibold text-slate-900">{t("Термины")}</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["lead", t("Заявка называется")],
                ["manager", t("Сотрудник называется")],
                ["amount", t("Сумма называется")],
              ] as const
            ).map(([key, title]) => (
              <div key={key} className="space-y-1.5">
                <Label>{title}</Label>
                <Select value={s.terms![key]} onValueChange={(v) => setTerm(key, v as never)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERM_CHOICES[key].map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {t("Сохранить")}
          </Button>
          {busy === "template" && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {notice && <span className={cn("text-sm", notice.ok ? "text-emerald-600" : "text-red-600")}>{notice.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
