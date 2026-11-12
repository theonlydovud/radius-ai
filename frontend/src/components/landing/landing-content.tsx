"use client";

import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Bot,
  ClipboardCheck,
  Crown,
  FlaskConical,
  Hand,
  History,
  Instagram,
  KeyRound,
  Layers,
  LineChart,
  MessagesSquare,
  Repeat2,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { HeroScene } from "@/components/landing/hero-scene";
import { ChatDemo } from "@/components/landing/chat-demo";
import { RevealOnScroll } from "@/components/landing/reveal";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { t } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/**
 * Лендинг DexaAI. Свёрстан под светлую тему на шкале slate: в тёмной теме шкала
 * переворачивается (globals.css), поэтому одни и те же классы работают в обеих.
 * Макеты экранов (телефон, CRM) — всегда тёмные, это «скриншоты».
 */

const STEPS = [
  { icon: Instagram, title: "Клиент пишет в Direct", text: "В любое время суток — ночью, в выходные, когда менеджеры заняты." },
  { icon: Bot, title: "DexaAI отвечает", text: "По знаниям и правилам вашей компании. Несколько коротких сообщений подряд получают один связный ответ." },
  { icon: ClipboardCheck, title: "Собирает заявку", text: "Узнаёт всё, что нужно менеджеру: для логистики — маршрут, вес или груз и телефон. Неполные и мусорные данные отсекаются." },
  { icon: UserCheck, title: "Передаёт менеджеру", text: "Заявки распределяются по очереди и сразу приходят в Telegram-группу с кнопкой «Взять»." },
];

const FEATURES = [
  { icon: Zap, title: "Ответ 24/7", text: "ИИ отвечает в Instagram Direct сразу, без выходных и очередей." },
  { icon: BookOpen, title: "Знания вашей компании", text: "Вы сами пишете, что рассказывать клиентам: услуги, условия, частые вопросы." },
  { icon: ShieldCheck, title: "Правила общения", text: "Тон, о чём молчать, что обязательно спросить — ИИ держится ваших правил." },
  { icon: FlaskConical, title: "Песочница", text: "Проверьте, как ИИ отвечает, прежде чем пустить его к клиентам." },
  { icon: Repeat2, title: "Очередь менеджеров", text: "Каждая новая заявка уходит следующему менеджеру. Нагрузка — поровну." },
  { icon: BellRing, title: "Уведомления в Telegram", text: "Заявка приходит в рабочую группу с упоминанием ответственного и кнопкой «Взять»." },
  { icon: MessagesSquare, title: "Перехват диалога", text: "Менеджер может в любой момент взять переписку на себя — ИИ замолчит." },
  { icon: History, title: "История чатов", text: "Все диалоги с точным временем сообщений — видно, кто и что ответил." },
  { icon: Layers, title: "Несколько аккаунтов", text: "Подключите несколько Instagram — у каждого свои знания, правила, заявки и статистика." },
];

const delay = (ms: number) => ({ ["--reveal-delay" as string]: `${ms}ms` }) as React.CSSProperties;

function Section({ id, eyebrow, title, text, children }: { id?: string; eyebrow: string; title: React.ReactNode; text?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-2xl text-center" data-reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{title}</h2>
        {text && <p className="mt-4 text-base leading-relaxed text-slate-600">{text}</p>}
      </div>
      <div className="mt-12 md:mt-16">{children}</div>
    </section>
  );
}

/** Схематичный экран CRM менеджера — иллюстрация интерфейса (всегда тёмная). */
function CrmPreview() {
  const bars = [3, 5, 2, 6, 4, 7, 5, 8, 6, 9, 7, 10];
  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0b0d1a] p-4 shadow-2xl sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">{t("Мои показатели")}</p>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/50">{t("30 дней")}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Новые", color: "#eda100" },
          { label: "Продано", color: "#1baf7a" },
          { label: "Конверсия", color: "#2a78d6" },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-white/50">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: x.color }} />
              {t(x.label)}
            </p>
            <div className="mt-2 h-4 w-10 rounded bg-white/15" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-32 items-end gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
        {bars.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col-reverse gap-[2px]" style={{ height: `${h * 10}%` }}>
            <span className="bar-grow block flex-[2] rounded-[2px] bg-[#1baf7a]" style={{ animationDelay: `${i * 60}ms` }} />
            <span className="bar-grow block flex-1 bg-[#eb6834]" style={{ animationDelay: `${i * 60}ms` }} />
            <span className="bar-grow block flex-[1.5] rounded-t-[4px] bg-[#2a78d6]" style={{ animationDelay: `${i * 60}ms` }} />
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <span className="h-8 w-1 rounded-full" style={{ background: i ? "#2a78d6" : "#eda100" }} />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-24 rounded bg-white/20" />
              <div className="h-2 w-40 rounded bg-white/10" />
            </div>
            <span className="rounded-md bg-gradient-to-r from-[#3D6BFF] to-[#5B4BFF] px-2.5 py-1 text-[11px] font-medium text-white">{i ? t("Продано") : t("Взять")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingContent() {
  const { dark } = useTheme();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-slate-700 antialiased">
      <RevealOnScroll />

      {/* Навигация */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href="/" aria-label="DexaAI" className="shrink-0">
            <DexaLogo size={30} />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
            <a href="#how" className="transition hover:text-slate-900">{t("Как это работает")}</a>
            <a href="#features" className="transition hover:text-slate-900">{t("Возможности")}</a>
            <a href="#crm" className="transition hover:text-slate-900">CRM</a>
          </nav>
          <div className="flex items-center gap-1">
            <LangSwitcher />
            <ThemeToggle />
            <Link href="/login" className="ml-1 hidden h-9 items-center rounded-full px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex">
              {t("Войти")}
            </Link>
            <Link
              href="/register"
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-900 px-4 text-sm font-medium text-background transition hover:opacity-90"
            >
              {t("Регистрация")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Первый экран */}
      <section className="relative isolate flex min-h-[100svh] select-none items-center overflow-hidden pt-16">
        <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(60%_60%_at_70%_45%,rgba(61,107,255,0.22),transparent_70%),radial-gradient(40%_50%_at_85%_70%,rgba(164,69,245,0.18),transparent_70%),radial-gradient(50%_40%_at_10%_10%,rgba(34,211,238,0.10),transparent_70%)]" />
        <HeroScene dark={dark} className="absolute inset-0 -z-10 opacity-60 lg:opacity-100" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-background" />

        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-surface/60 px-3 py-1 text-xs text-slate-600 backdrop-blur" data-reveal>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {t("ИИ-менеджер для Instagram Direct")}
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl md:text-6xl" data-reveal style={delay(80)}>
              <span className="block">{t("Отвечает клиентам")}</span>
              <span className="text-gradient-anim block pb-1">{t("за секунды.")}</span>
              <span className="block">{t("Приносит заявки.")}</span>
            </h1>
            <p className="mt-6 max-w-xl select-text text-base leading-relaxed text-slate-600 sm:text-lg" data-reveal style={delay(160)}>
              {t("DexaAI ведёт переписку в Direct круглосуточно по знаниям вашей компании, собирает данные заявки и передаёт её менеджеру. А всё остальное — в простой CRM с показателями.")}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row" data-reveal style={delay(240)}>
              <Link
                href="/register"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#3D6BFF] via-[#5B4BFF] to-[#A445F5] px-7 text-sm font-semibold text-white shadow-[0_10px_40px_-10px_rgba(91,75,255,0.8)] transition hover:shadow-[0_14px_50px_-8px_rgba(91,75,255,0.95)]"
              >
                {t("Зарегистрироваться")}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-surface/60 px-7 text-sm font-medium text-slate-900 backdrop-blur transition hover:bg-surface"
              >
                {t("Как это работает")}
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500" data-reveal style={delay(320)}>
              {["14 дней бесплатно", "Ответ 24/7", "Заявки без мусора", "Очередь менеджеров", "Работает с телефона"].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-brand" />
                  {t(x)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="pointer-events-none absolute bottom-8 right-6 hidden items-center gap-2 rounded-full border border-slate-200 bg-surface/60 px-3 py-1.5 text-xs text-slate-500 backdrop-blur lg:flex">
          <Hand className="h-3.5 w-3.5" />
          {t("Покрутите сферу")}
        </p>
      </section>

      {/* Как это работает */}
      <Section id="how" eyebrow={t("Как это работает")} title={t("От сообщения в Direct до заявки у менеджера")} text={t("Четыре шага, которые DexaAI делает сам. Менеджеру остаётся позвонить клиенту.")}>
        <ol className="relative grid grid-cols-1 gap-4 md:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-[#5B4BFF]/50 to-transparent md:block" />
          {STEPS.map((s, i) => (
            <li key={s.title} className="glow-card relative rounded-2xl p-6" data-reveal style={delay(i * 90)}>
              <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#3D6BFF] to-[#A445F5] text-white shadow-[0_8px_30px_-8px_rgba(91,75,255,0.9)]">
                <s.icon className="h-5 w-5" />
              </span>
              <p className="mt-5 text-xs font-medium text-brand">{t("Шаг {0}", i + 1)}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{t(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(s.text)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Пример диалога */}
      <section className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 pb-28 pt-8 sm:px-6 lg:grid-cols-2">
        <div data-reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">{t("В деле")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{t("Разговор, который заканчивается заявкой")}</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            {t("DexaAI задаёт только нужные вопросы и не отпускает клиента без контакта. Как только данных достаточно — заявка появляется в CRM у ответственного менеджера.")}
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: MessagesSquare, text: "Понимает, когда клиент пишет несколькими сообщениями подряд, и отвечает одним." },
              { icon: ClipboardCheck, text: "Создаёт заявку, только когда есть маршрут, груз или вес и телефон." },
              { icon: BellRing, text: "Менеджер видит заявку в CRM и в Telegram-группе — с кнопкой «Взять»." },
            ].map((f) => (
              <li key={f.text} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-surface">
                  <f.icon className="h-4 w-4 text-brand" />
                </span>
                <span className="text-sm leading-relaxed text-slate-700">{t(f.text)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="pb-10" data-reveal style={delay(120)}>
          <ChatDemo />
        </div>
      </section>

      {/* Возможности */}
      <Section id="features" eyebrow={t("Возможности")} title={t("Всё, что нужно отделу продаж в Direct")} text={t("Без сложных настроек: подключили Instagram, заполнили знания — и ИИ работает.")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="glow-card rounded-2xl p-6 transition hover:-translate-y-1" data-reveal style={delay((i % 3) * 80)}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft ring-1 ring-slate-200">
                <f.icon className="h-5 w-5 text-brand" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{t(f.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(f.text)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CRM */}
      <Section
        id="crm"
        eyebrow="CRM"
        title={
          <>
            {t("Простая CRM, в которой")} <span className="text-gradient-anim">{t("разберётся каждый")}</span>
          </>
        }
        text={t("Каждый сотрудник входит под своим паролем и видит ровно то, что ему нужно.")}
      >
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="glow-card rounded-2xl p-6" data-reveal>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B4BFF] to-[#A445F5]">
                  <Crown className="h-5 w-5 text-white" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">{t("Руководитель")}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {t("Полная панель: знания и правила ИИ, заявки всех менеджеров, статистика по каждому, история чатов, аккаунты и настройки.")}
              </p>
            </div>
            <div className="glow-card rounded-2xl p-6" data-reveal style={delay(100)}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3D6BFF] to-[#22a2c8]">
                  <Users className="h-5 w-5 text-white" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900">{t("Менеджер")}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {t("Одна страница: свои заявки, переписка клиента с ИИ, кнопки «Взять», «Продано», «Не продано» с причиной — и личные показатели с графиками.")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-reveal style={delay(200)}>
              {[
                { icon: KeyRound, text: "Свой пароль у каждого" },
                { icon: Smartphone, text: "Устройство запоминается" },
                { icon: LineChart, text: "Конверсия и причины отказов" },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface/60 px-3 py-3 text-xs text-slate-700">
                  <f.icon className="h-4 w-4 shrink-0 text-brand" />
                  {t(f.text)}
                </div>
              ))}
            </div>
          </div>
          <div className="float-y" data-reveal style={delay(150)}>
            <CrmPreview />
          </div>
        </div>
      </Section>

      {/* Призыв */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12" data-reveal>
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(91,75,255,0.55),transparent_70%),linear-gradient(135deg,#0c1230,#130b2a)]" />
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">{t("Ваши клиенты уже пишут в Direct")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/75">{t("Пусть DexaAI отвечает им сразу, а менеджеры получают готовые заявки.")}</p>
          <Link href="/register" className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-sm font-semibold text-[#0c1230] transition hover:bg-white/90">
            {t("Зарегистрироваться")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <DexaLogo size={24} />
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-slate-800">
              {t("Политика конфиденциальности")}
            </Link>
            <span>© 2026 DexaAI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
