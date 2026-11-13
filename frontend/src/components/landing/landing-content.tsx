"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  ClipboardCheck,
  Clock3,
  Globe2,
  Hand,
  Instagram,
  Mic,
  Minus,
  MoonStar,
  Repeat2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { DexaLogo } from "@/components/brand/dexa-logo";
import { HeroScene } from "@/components/landing/hero-scene";
import { HeroPhone } from "@/components/landing/hero-phone";
import { RevealOnScroll } from "@/components/landing/reveal";
import { LangSwitcher, ThemeToggle } from "@/components/prefs";
import { locale, t } from "@/lib/i18n";
import { planLines, POPULAR_PLAN, usePlans } from "@/lib/plans";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Лендинг DexaAI. Лёгкий по построению: анимации — только CSS (transform/opacity),
 * свечения — статичные радиальные градиенты без blur-фильтров, 3D-сфера грузится только
 * на компьютере с нормальным экраном. Свёрстан на шкале slate — в тёмной теме она
 * переворачивается (globals.css). Макеты экранов всегда тёмные — это «скриншоты».
 */

const delay = (ms: number) => ({ ["--reveal-delay" as string]: `${ms}ms` }) as React.CSSProperties;

const INDUSTRIES = [
  "Логистика и карго",
  "Онлайн-школы и курсы",
  "Магазины одежды",
  "Мебель и интерьер",
  "Салоны красоты",
  "Клиники",
  "Туризм",
  "Недвижимость",
  "Автотовары",
  "Электроника",
];

const COMPARE = [
  { before: "Клиент ждёт ответа часами и пишет конкуренту", after: "Ответ меньше чем за минуту" },
  { before: "Ночью и в выходные в Direct тишина", after: "Работает 24/7 без выходных" },
  { before: "Заявки теряются в переписке", after: "Каждая заявка — в CRM с телефоном" },
  { before: "Менеджеры делят клиентов вручную", after: "Очередь раздаёт заявки поровну" },
  { before: "Непонятно, сколько клиентов купило", after: "Статистика, конверсия и причины отказов" },
];

const STEPS = [
  { icon: Instagram, title: "Клиент пишет в Direct", text: "Когда угодно — ночью, в выходные, пока менеджеры заняты." },
  { icon: Bot, title: "DexaAI отвечает", text: "По знаниям и правилам вашей компании, на языке клиента. Несколько сообщений подряд — один связный ответ." },
  { icon: ClipboardCheck, title: "Собирает заявку", text: "Узнаёт, что нужно клиенту, и берёт телефон. Приветствия, шутки и спам заявками не становятся." },
  { icon: UserCheck, title: "Передаёт менеджеру", text: "Заявка появляется в CRM у следующего менеджера по очереди — ему остаётся позвонить." },
];

const FAQ = [
  {
    q: "Что считается одним сообщением?",
    a: "Одно сообщение — это один ответ бота. Если клиент пишет несколько сообщений подряд, бот ждёт 20 секунд тишины и отвечает на всё сразу — это одно сообщение из лимита.",
  },
  {
    q: "Что будет, когда сообщения закончатся?",
    a: "Бот перестанет отвечать клиентам до продления тарифа. Заявки, переписка и CRM остаются на месте — менеджеры продолжают работать.",
  },
  {
    q: "Как работает пробный период?",
    a: "14 дней бесплатно на тарифе, который вы выбрали при регистрации, — с его функциями и лимитом сообщений. Карта не нужна.",
  },
  {
    q: "На каком языке отвечает бот?",
    a: "На языке клиента: узбекском (латиница и кириллица), русском или английском. Клиент перешёл на другой язык — бот переходит вслед за ним.",
  },
  {
    q: "Можно подключить два Instagram-аккаунта?",
    a: "Один аккаунт — одна компания со своими знаниями, правилами и заявками. Для второго Instagram зарегистрируйте отдельную компанию.",
  },
  {
    q: "Можно войти в один аккаунт с двух устройств?",
    a: "Нет: один аккаунт работает на одном устройстве, новый вход завершает прежний. Для сотрудников добавьте пользователей — у каждого свой вход.",
  },
];

/** 3D-сфера — только на компьютере: на телефонах и в режиме «меньше движения» three.js даже не грузится. */
function useDesktopScene() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const update = () => setOk(mq.matches && (navigator.hardwareConcurrency ?? 4) >= 4);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return ok;
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: React.ReactNode; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center" data-reveal>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-[2.6rem] md:leading-[1.12]">{title}</h2>
      {text && <p className="mt-4 text-base leading-relaxed text-slate-600">{text}</p>}
    </div>
  );
}

function PlanTag({ plan }: { plan: string }) {
  return <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">{plan}</span>;
}

export function LandingContent() {
  const { dark } = useTheme();
  const scene = useDesktopScene();
  const plans = usePlans();
  const fmt = new Intl.NumberFormat(locale());

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-slate-700 antialiased">
      <RevealOnScroll />

      {/* Навигация */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href="/" aria-label="DexaAI" className="shrink-0">
            <DexaLogo size={28} />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-500 lg:flex">
            <a href="#how" className="transition hover:text-slate-900">{t("Как это работает")}</a>
            <a href="#features" className="transition hover:text-slate-900">{t("Возможности")}</a>
            <a href="#pricing" className="transition hover:text-slate-900">{t("Тарифы")}</a>
            <a href="#faq" className="transition hover:text-slate-900">{t("Вопросы")}</a>
          </nav>
          <div className="flex items-center gap-1">
            <LangSwitcher />
            <ThemeToggle />
            <Link href="/login" className="ml-1 hidden h-9 items-center rounded-full px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex">
              {t("Войти")}
            </Link>
            <Link href="/register" className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-900 px-4 text-sm font-medium text-background transition hover:opacity-90">
              {t("Попробовать")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Первый экран */}
      <section className="relative isolate overflow-hidden pt-16">
        <div aria-hidden className="hero-mesh absolute inset-0 -z-20" />
        <div aria-hidden className="hero-grid absolute inset-0 -z-20" />
        {scene && <HeroScene dark={dark} className="absolute inset-0 -z-10 opacity-70" />}
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-background" />

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.1fr_0.9fr] lg:pb-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-surface/70 px-3 py-1 text-xs text-slate-600" data-reveal>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t("ИИ-менеджер для Instagram Direct")}
            </p>
            <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-slate-900 sm:text-6xl lg:text-[4.2rem]" data-reveal style={delay(80)}>
              {t("Каждый, кто пишет в Direct,")} <span className="text-gradient-anim">{t("становится заявкой")}</span>
            </h1>
            <p className="mt-6 max-w-xl select-text text-base leading-relaxed text-slate-600 sm:text-lg" data-reveal style={delay(160)}>
              {t("DexaAI отвечает клиентам 24/7 на их языке, собирает данные заявки и передаёт её менеджеру. Вы видите каждую заявку, переписку и конверсию — в простой CRM.")}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row" data-reveal style={delay(240)}>
              <Link
                href="/register"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#5B4CED] px-7 text-sm font-semibold text-white shadow-[0_12px_40px_-10px_rgba(91,76,237,0.85)] transition hover:bg-[#4F40E0]"
              >
                {t("Начать 14 дней бесплатно")}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a href="#pricing" className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-surface/70 px-7 text-sm font-medium text-slate-900 transition hover:bg-surface">
                {t("Смотреть тарифы")}
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-slate-600" data-reveal style={delay(320)}>
              {[
                { icon: MoonStar, text: "Работает 24/7" },
                { icon: Globe2, text: "UZ · RU · EN" },
                { icon: Clock3, text: "Без программистов" },
              ].map((x) => (
                <li key={x.text} className="flex items-center gap-2">
                  <x.icon className="h-4 w-4 text-brand" />
                  {t(x.text)}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative pb-6 lg:pb-0" data-reveal style={delay(200)}>
            <HeroPhone />
          </div>
        </div>

        {scene && (
          <p className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-surface/70 px-3 py-1.5 text-xs text-slate-500 lg:flex">
            <Hand className="h-3.5 w-3.5" />
            {t("Покрутите сферу")}
          </p>
        )}
      </section>

      {/* Для кого — бегущая строка */}
      <section aria-label={t("Для кого")} className="border-y border-slate-200/70 bg-surface/50 py-5">
        <div className="marquee-mask overflow-hidden">
          <div className="marquee flex w-max gap-3">
            {[...INDUSTRIES, ...INDUSTRIES].map((x, i) => (
              <span key={i} aria-hidden={i >= INDUSTRIES.length} className="whitespace-nowrap rounded-full border border-slate-200 bg-surface px-4 py-1.5 text-sm text-slate-600">
                {t(x)}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Было / стало */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-28">
        <SectionTitle
          eyebrow={t("Зачем")}
          title={
            <>
              {t("Клиенты пишут в Direct.")} <span className="text-gradient-anim">{t("Отвечает ли им кто-нибудь?")}</span>
            </>
          }
          text={t("Пока менеджер занят, клиент уходит к тем, кто ответил первым. DexaAI отвечает сразу — и не забывает взять телефон.")}
        />
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-surface p-6 sm:p-8" data-reveal>
            <p className="text-sm font-semibold text-slate-400">{t("Без DexaAI")}</p>
            <ul className="mt-5 space-y-4">
              {COMPARE.map((c) => (
                <li key={c.before} className="flex items-start gap-3 text-[15px] text-slate-500">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    <X className="h-3 w-3 text-slate-400" />
                  </span>
                  {t(c.before)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-[#121318] p-6 text-white sm:p-8" data-reveal style={delay(120)}>
            <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 bg-[radial-gradient(closest-side,rgba(91,76,237,0.55),transparent)]" />
            <p className="relative flex items-center gap-2 text-sm font-semibold text-[#A79FFF]">
              <Sparkles className="h-4 w-4" /> {t("С DexaAI")}
            </p>
            <ul className="relative mt-5 space-y-4">
              {COMPARE.map((c) => (
                <li key={c.after} className="flex items-start gap-3 text-[15px] text-white/90">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5B4CED]">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                  {t(c.after)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6 md:pb-28">
        <SectionTitle eyebrow={t("Как это работает")} title={t("От сообщения в Direct до заявки у менеджера")} text={t("Четыре шага, которые DexaAI делает сам.")} />
        <ol className="relative mt-14 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div aria-hidden className="absolute left-[12%] right-[12%] top-10 hidden h-px bg-gradient-to-r from-transparent via-[#5B4CED]/60 to-transparent md:block" />
          {STEPS.map((s, i) => (
            <li key={s.title} className="glow-card relative rounded-2xl p-6" data-reveal style={delay(i * 90)}>
              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5B4CED] text-white shadow-[0_10px_30px_-8px_rgba(91,76,237,0.9)]">
                <s.icon className="h-5 w-5" />
                <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#121318] text-[10px] font-semibold text-white ring-2 ring-background">{i + 1}</span>
              </span>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{t(s.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(s.text)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Возможности — плитка */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6 md:pb-28">
        <SectionTitle
          eyebrow={t("Возможности")}
          title={
            <>
              {t("Отдел продаж в Direct,")} <span className="text-gradient-anim">{t("который не устаёт")}</span>
            </>
          }
          text={t("Подключили Instagram, написали, что рассказывать клиентам, — и ИИ работает.")}
        />
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
          {/* Заявки без мусора */}
          <div className="glow-card overflow-hidden rounded-3xl p-6 md:col-span-4" data-reveal>
            <ClipboardCheck className="h-6 w-6 text-brand" />
            <h3 className="mt-4 text-xl font-semibold text-slate-900">{t("Заявки без мусора")}</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              {t("Заявка создаётся, только когда есть всё нужное менеджеру: что хочет клиент и телефон. «Просто спросить» и спам заявками не становятся.")}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { who: "Азиза", what: t("Курс PRO, вечерняя группа"), tone: "bg-[#eda100]", status: t("Новая") },
                { who: "Тимур", what: t("Китай → Ташкент, мебель 5 т"), tone: "bg-[#1baf7a]", status: t("Продано") },
              ].map((l) => (
                <div key={l.who} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#121318] p-3.5 text-white">
                  <span className={cn("h-9 w-1 rounded-full", l.tone)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.who}</p>
                    <p className="truncate text-xs text-white/60">{l.what}</p>
                  </div>
                  <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80">{l.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Язык клиента */}
          <div className="glow-card rounded-3xl p-6 md:col-span-2" data-reveal style={delay(80)}>
            <Globe2 className="h-6 w-6 text-brand" />
            <h3 className="mt-4 text-xl font-semibold text-slate-900">{t("На языке клиента")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("Узбекский латиницей и кириллицей, русский, английский — бот отвечает так, как к нему обратились.")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["O‘zbekcha", "Ўзбекча", "Русский", "English"].map((x) => (
                <span key={x} className="rounded-full border border-slate-200 bg-surface px-3 py-1 text-xs text-slate-700">{x}</span>
              ))}
            </div>
          </div>

          {/* Серия сообщений */}
          <div className="glow-card rounded-3xl p-6 md:col-span-2" data-reveal>
            <Repeat2 className="h-6 w-6 text-brand" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{t("Один ответ на серию сообщений")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("Клиент пишет тремя сообщениями подряд — бот дожидается конца и отвечает на всё сразу.")}</p>
          </div>

          {/* Знания и правила */}
          <div className="glow-card rounded-3xl p-6 md:col-span-2" data-reveal style={delay(80)}>
            <BookOpen className="h-6 w-6 text-brand" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{t("Ваши знания и правила")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("Вы пишете, что рассказывать и о чём молчать. ИИ отвечает только по этим фактам, а проверить его можно в песочнице.")}</p>
          </div>

          {/* Очередь */}
          <div className="glow-card rounded-3xl p-6 md:col-span-2" data-reveal style={delay(160)}>
            <div className="flex items-center justify-between">
              <UserCheck className="h-6 w-6 text-brand" />
              <PlanTag plan="Business · Pro" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{t("Очередь менеджеров")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("Каждая новая заявка — следующему менеджеру по кругу. Нагрузка поровну, споров нет.")}</p>
            <div className="mt-4 flex -space-x-2">
              {["А", "Б", "Д"].map((x, i) => (
                <span key={x} className={cn("queue-dot flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-background", ["bg-[#5B4CED]", "bg-[#1baf7a]", "bg-[#eda100]"][i])} style={{ animationDelay: `${i * 1.2}s` }}>
                  {x}
                </span>
              ))}
            </div>
          </div>

          {/* Статистика */}
          <div className="glow-card overflow-hidden rounded-3xl p-6 md:col-span-3" data-reveal>
            <div className="flex items-center justify-between">
              <BarChart3 className="h-6 w-6 text-brand" />
              <PlanTag plan="Business · Pro" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{t("Статистика и перехват диалога")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("Конверсия по каждому менеджеру и причины отказов. Вся переписка — в истории чатов; менеджер может взять диалог на себя, и ИИ замолчит.")}</p>
            <div className="mt-5 flex h-24 items-end gap-1.5">
              {[4, 6, 3, 7, 5, 8, 6, 9, 7, 10, 8, 11].map((h, i) => (
                <span key={i} className="bar-grow flex-1 rounded-t-md bg-gradient-to-t from-[#5B4CED] to-[#8D82FF]" style={{ height: `${h * 9}%`, animationDelay: `${i * 50}ms` }} />
              ))}
            </div>
          </div>

          {/* ИИ-ассистент */}
          <div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-[#121318] p-6 text-white md:col-span-3" data-reveal style={delay(100)}>
            <div aria-hidden className="absolute -bottom-24 -right-16 h-64 w-64 bg-[radial-gradient(closest-side,rgba(91,76,237,0.6),transparent)]" />
            <div className="relative flex items-center justify-between">
              <Mic className="h-6 w-6 text-[#A79FFF]" />
              <span className="rounded-full border border-[#8D82FF]/40 bg-[#5B4CED]/20 px-2 py-0.5 text-[10px] font-semibold text-[#C9C3FF]">Pro</span>
            </div>
            <h3 className="relative mt-4 text-lg font-semibold">{t("ИИ-ассистент руководителя")}</h3>
            <p className="relative mt-2 text-sm leading-relaxed text-white/70">{t("Скажите голосом или напишите — ассистент создаст заявку, назначит менеджера или покажет статистику.")}</p>
            <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
              <p className="text-sm text-white/85">«{t("Покажи статистику за прошлую неделю")}»</p>
              <div className="mt-3 flex h-6 items-center gap-[3px]" aria-hidden>
                {Array.from({ length: 28 }, (_, i) => (
                  <span key={i} className="wave-bar w-[3px] rounded-full bg-[#8D82FF]" style={{ animationDelay: `${(i % 7) * 0.11}s` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Тарифы */}
      <section id="pricing" className="relative scroll-mt-20 py-24 md:py-28">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(91,76,237,0.10),transparent_70%)]" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle eyebrow={t("Тарифы")} title={t("Платите за ответы, а не за обещания")} text={t("14 дней бесплатно на любом тарифе. Сменить тариф можно в любой момент.")} />
          <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {plans.map((p, i) => {
              const popular = p.code === POPULAR_PLAN;
              return (
                <div
                  key={p.code}
                  className={cn(
                    "relative flex flex-col rounded-3xl p-7",
                    popular ? "bg-[#121318] text-white shadow-[0_30px_80px_-30px_rgba(91,76,237,0.8)] ring-1 ring-[#5B4CED] lg:-my-4 lg:py-11" : "glow-card"
                  )}
                  data-reveal
                  style={delay(i * 90)}
                >
                  {popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#5B4CED] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      {t("Популярный")}
                    </span>
                  )}
                  <p className={cn("text-lg font-semibold", popular ? "text-white" : "text-slate-900")}>{p.name}</p>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className={cn("text-4xl font-semibold tracking-tight", popular ? "text-white" : "text-slate-900")}>{fmt.format(p.price)}</span>
                    <span className={cn("text-sm", popular ? "text-white/60" : "text-slate-500")}>{t("сум/мес")}</span>
                  </p>
                  <ul className="mt-7 flex-1 space-y-3 text-sm">
                    {planLines(p, fmt).map((l) => (
                      <li key={l.text} className={cn("flex items-start gap-2.5", !l.ok && (popular ? "text-white/35" : "text-slate-400"))}>
                        {l.ok ? (
                          <Check className={cn("mt-0.5 h-4 w-4 shrink-0", popular ? "text-[#A79FFF]" : "text-brand")} />
                        ) : (
                          <Minus className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                        )}
                        <span className={l.ok ? (popular ? "text-white/90" : "text-slate-700") : undefined}>{l.text}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/register?plan=${p.code}`}
                    className={cn(
                      "mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold transition",
                      popular ? "bg-[#5B4CED] text-white hover:bg-[#4F40E0]" : "border border-slate-300 text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    {t("Попробовать 14 дней")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-brand" />
            {t("Один аккаунт — одно устройство. Сообщение — это один ответ бота.")}
          </p>
        </div>
      </section>

      {/* Вопросы */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-24 sm:px-6 md:pb-28">
        <SectionTitle eyebrow={t("Вопросы")} title={t("Коротко о главном")} />
        <div className="mt-12 space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} className="faq group rounded-2xl border border-slate-200 bg-surface px-5 py-4 open:shadow-sm" data-reveal style={delay(i * 50)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-slate-900">
                {t(f.q)}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(f.a)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Призыв */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#121318] px-6 py-16 text-center sm:px-12 md:py-20" data-reveal>
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(91,76,237,0.55),transparent_70%)]" />
          <div aria-hidden className="hero-grid absolute inset-0 opacity-40" />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-5xl md:leading-[1.08]">{t("Ваши клиенты уже пишут в Direct")}</h2>
          <p className="relative mx-auto mt-5 max-w-xl text-base text-white/70">{t("Пусть DexaAI отвечает им сразу, а менеджеры получают готовые заявки. Первые 14 дней — бесплатно.")}</p>
          <Link href="/register" className="relative mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-sm font-semibold text-[#121318] transition hover:bg-white/90">
            {t("Начать 14 дней бесплатно")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <DexaLogo size={22} />
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
