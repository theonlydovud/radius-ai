"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, Check, CheckCircle2, ClipboardList, Clock, Hourglass, Loader2, Lock, LogOut, Rocket, Sparkles } from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { homeFor, logout, trialDaysLeft, useCurrentUser } from "@/components/current-user";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { locale, t } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";

/**
 * Кабинет компании на пробном периоде: анкета и заявка «подключить навсегда».
 * На пробном периоде открыта вся панель (кнопка «В панель»); когда он закончится,
 * остаётся только кабинет, а ИИ перестаёт отвечать клиентам.
 */

type Profile = Record<string, string | null>;
type Cabinet = { id: string; name: string; status: string; trial_ends_at: string | null; profile: Profile; connect_requested_at: string | null };

const FIELDS: { key: string; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: "industry", label: "Сфера деятельности", placeholder: "Логистика, обучение, магазин…" },
  { key: "city", label: "Город", placeholder: "Ташкент" },
  { key: "contact_name", label: "Контактное лицо" },
  { key: "phone", label: "Телефон", placeholder: "+998 90 123 45 67" },
  { key: "instagram", label: "Instagram", placeholder: "@company" },
  { key: "telegram", label: "Telegram", placeholder: "@username" },
  { key: "website", label: "Сайт", placeholder: "https://…" },
  { key: "employees", label: "Сколько менеджеров по продажам", placeholder: "3" },
];

const DEFAULT_NAME = "Моя компания";

function LockedFeature({ icon: Icon, title }: { icon: typeof Bot; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-surface/60 px-4 py-3 text-sm text-slate-500">
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="flex-1">{t(title)}</span>
      <Lock className="h-3.5 w-3.5 text-slate-300" />
    </div>
  );
}

export default function CabinetPage() {
  const { user, company } = useCurrentUser();
  const daysLeft = trialDaysLeft(company);
  const expired = company.status === "expired";
  const [data, setData] = useState<Cabinet | null>(null);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<Profile>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/cabinet", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.data) throw new Error(j.error);
        setData(j.data);
        setName(j.data.name === DEFAULT_NAME ? "" : j.data.name);
        setProfile(j.data.profile ?? {});
      })
      .catch((e) => setError(t(e?.message || "Не удалось загрузить кабинет.")));
  }, []);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/cabinet", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, profile }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Не удалось сохранить.");
      setData(j.data);
      setSaved(true);
      return true;
    } catch (e: any) {
      setError(t(e?.message || "Не удалось сохранить."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function requestConnect() {
    // Сначала сохраняем анкету, чтобы в заявке были свежие данные.
    if (!(await save())) return;
    setRequesting(true);
    try {
      const res = await fetch("/api/cabinet/connect", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Не удалось отправить заявку.");
      setData(j.data);
    } catch (e: any) {
      setError(t(e?.message || "Не удалось отправить заявку."));
    } finally {
      setRequesting(false);
    }
  }

  const filled = !!name.trim() && !!profile.phone?.trim();
  const requested = !!data?.connect_requested_at;
  const steps = [
    { title: "Аккаунт создан — 14 дней бесплатно", done: true },
    { title: "Подключите Instagram и заполните базу знаний", done: false },
    { title: "Заполните данные компании", done: filled },
    { title: "Отправьте заявку на подключение", done: requested },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 md:px-8">
          <DexaLogo size={28} />
          <div className="flex items-center gap-1">
            <LangSwitcher />
            <ThemeToggle />
            <span className="ml-2 hidden text-sm text-slate-600 sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={() => logout("all")}
              className="ml-1 flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("Выйти")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("Добро пожаловать, {0}!", user.name.split(/\s+/)[0])}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("Это кабинет вашей компании в DexaAI.")}</p>

        {expired ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold">{t("Пробный период закончился")}</p>
              <p className="mt-0.5">{t("ИИ больше не отвечает вашим клиентам, панель приостановлена. Все данные сохранены — отправьте заявку, и мы подключим вас навсегда.")}</p>
            </div>
          </div>
        ) : daysLeft !== null ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm text-slate-700">
            <Sparkles className="h-5 w-5 shrink-0 text-brand" />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">{t("Пробный период тарифа {0}: осталось {1} дн.", company.plan?.name ?? "", daysLeft)}</span>{" "}
              {company.usage?.messages_limit != null &&
                t("Сообщения: {0} / {1}", company.usage.messages_used.toLocaleString(locale()), company.usage.messages_limit.toLocaleString(locale()))}
            </p>
            <Link href={homeFor(user.role)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand/90">
              {t("В панель")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          {/* Анкета */}
          <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-slate-900">{t("Данные компании")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("По ним мы подготовим ИИ-менеджера под ваш бизнес.")}</p>

            {!data && !error ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-1.5">
                  <Label htmlFor="cab-name">{t("Название компании")} *</Label>
                  <Input id="cab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Например, Radius Logistics")} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`cab-${f.key}`}>
                        {t(f.label)}
                        {f.key === "phone" && " *"}
                      </Label>
                      <Input
                        id={`cab-${f.key}`}
                        value={profile[f.key] ?? ""}
                        onChange={(e) => setProfile((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder ? t(f.placeholder) : undefined}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="cab-about">{t("Чем занимается компания")}</Label>
                  <Textarea
                    id="cab-about"
                    value={profile.about ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, about: e.target.value }))}
                    placeholder={t("Что продаёте, кто ваши клиенты, о чём чаще всего спрашивают в Direct")}
                    className="min-h-[96px]"
                  />
                </div>

                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                <div className="mt-5 flex items-center gap-3">
                  <Button type="submit" disabled={saving || !name.trim()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {t("Сохранить")}
                  </Button>
                  {saved && <span className="text-sm text-emerald-600">{t("Сохранено")}</span>}
                </div>
              </>
            )}
          </form>

          {/* Статус и подключение */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm">
              <div className="bg-gradient-to-br from-[#7A6CFF] via-[#5B4CED] to-[#8E5CF7] p-5 text-white">
                <Rocket className="h-6 w-6" />
                <p className="mt-3 text-lg font-semibold">{t("Подключить навсегда")}</p>
                <p className="mt-1 text-sm text-white/80">{t("Свой ИИ-бот, адрес вашей компании на dexa.uz и настройка ИИ под ваш бизнес. Оставьте заявку — свяжемся в Telegram.")}</p>
              </div>
              <div className="p-5">
                {requested ? (
                  <p className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      {t("Заявка отправлена {0}. Мы свяжемся с вами в Telegram.", formatDate(data!.connect_requested_at!))}
                    </span>
                  </p>
                ) : (
                  <>
                    <Button className="w-full" onClick={requestConnect} disabled={requesting || saving || !filled}>
                      {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {t("Отправить заявку")}
                    </Button>
                    {!filled && <p className="mt-2 text-xs text-slate-500">{t("Сначала укажите название компании и телефон.")}</p>}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{t("Как подключиться")}</p>
              <ol className="mt-3 space-y-3">
                {steps.map((s, i) => (
                  <li key={s.title} className="flex items-start gap-3 text-sm">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        s.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={s.done ? "text-slate-500 line-through decoration-slate-300" : "text-slate-700"}>{t(s.title)}</span>
                  </li>
                ))}
              </ol>
            </div>

            {expired && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  {t("Приостановлено до подключения")}
                </p>
                <LockedFeature icon={Bot} title="ИИ-менеджер в Instagram Direct" />
                <LockedFeature icon={ClipboardList} title="Заявки и CRM для менеджеров" />
                <LockedFeature icon={BarChart3} title="Статистика и графики" />
                <LockedFeature icon={Sparkles} title="ИИ-ассистент руководителя" />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
