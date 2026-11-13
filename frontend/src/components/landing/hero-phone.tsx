"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, Phone, Sparkles } from "lucide-react";
import { DexaMark } from "@/components/brand/dexa-logo";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * Телефон с перепиской в Direct на первом экране. По кругу — три диалога на трёх языках:
 * бот отвечает на языке клиента и в конце создаёт заявку. Тексты диалогов не переводятся —
 * в этом и смысл. Крутится, только пока виден; при reduced motion — первый диалог целиком.
 */

type Msg = { from: "client" | "ai"; text: string };
type Dialog = { lang: "UZ" | "RU" | "EN"; account: string; msgs: Msg[]; lead: string };

const DIALOGS: Dialog[] = [
  {
    lang: "UZ",
    account: "@mebel_house.uz",
    msgs: [
      { from: "client", text: "Assalomu alaykum! Burchak divan bormi?" },
      { from: "ai", text: "Va alaykum assalom! Ha, kulrang va bej ranglari bor. Yetkazib berish kerakmi?" },
      { from: "client", text: "Ha, Chilonzorga" },
      { from: "ai", text: "Telefon raqamingizni qoldiring — menejer narx va yetkazishni aytib beradi." },
      { from: "client", text: "+998 90 123 45 67" },
    ],
    lead: "Угловой диван, доставка в Чиланзар",
  },
  {
    lang: "RU",
    account: "@cargo_express",
    msgs: [
      { from: "client", text: "Здравствуйте! Нужно привезти груз из Китая в Ташкент" },
      { from: "ai", text: "Здравствуйте! Что везём и какой примерно вес или объём?" },
      { from: "client", text: "Мебель, около 5 тонн" },
      { from: "ai", text: "Оставьте номер — логист рассчитает стоимость и свяжется с вами." },
      { from: "client", text: "+998 93 555 11 22" },
    ],
    lead: "Китай → Ташкент, мебель 5 т",
  },
  {
    lang: "EN",
    account: "@smart_english.school",
    msgs: [
      { from: "client", text: "Hi! Do you have English courses for beginners?" },
      { from: "ai", text: "Hello! Yes — a Beginner course, mornings or evenings. Which time suits you?" },
      { from: "client", text: "Evenings please" },
      { from: "ai", text: "Great! Leave your number and our manager will book a free trial lesson for you." },
      { from: "client", text: "+998 97 700 00 77" },
    ],
    lead: "Курс Beginner, вечерняя группа",
  },
];

const STEP_MS = 1400;

export function HeroPhone() {
  const [dialog, setDialog] = useState(0);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const d = DIALOGS[dialog];
  const done = shown > d.msgs.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(DIALOGS[0].msgs.length + 1);
      return;
    }
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.2 });
    if (box.current) io.observe(box.current);

    let dlg = 0;
    let step = 0;
    const timer = setInterval(() => {
      if (!visible || document.hidden) return;
      const msgs = DIALOGS[dlg].msgs;
      step += 1;
      if (step > msgs.length + 3) {
        // Пауза на готовой заявке — и следующий язык.
        dlg = (dlg + 1) % DIALOGS.length;
        step = 0;
        setDialog(dlg);
      }
      const next = Math.min(step, msgs.length + 1);
      setTyping(next < msgs.length && DIALOGS[dlg].msgs[next]?.from === "ai");
      setShown(next);
    }, STEP_MS);
    return () => {
      clearInterval(timer);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={box} className="relative mx-auto w-full max-w-[330px]">
      {/* Свечение за телефоном — статичный градиент, без blur-фильтра (дёшево для слабых видеокарт). */}
      <div aria-hidden className="absolute -inset-16 -z-10 bg-[radial-gradient(closest-side,rgba(91,76,237,0.45),transparent)]" />

      <div className="relative rounded-[2.6rem] border border-white/15 bg-[#121318] p-2.5 shadow-[0_40px_120px_-30px_rgba(91,76,237,0.65)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-[#0b0c12]">
          {/* Шапка Direct */}
          <div className="flex items-center gap-2.5 border-b border-white/10 px-4 pb-3 pt-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-[#121318]">
                <DexaMark size={16} />
              </span>
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-white">{d.account}</p>
              <p className="text-[10px] text-emerald-400">{t("отвечает DexaAI")}</p>
            </div>
            <div className="flex gap-1">
              {DIALOGS.map((x, i) => (
                <span
                  key={x.lang}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                    i === dialog ? "bg-[#5B4CED] text-white" : "bg-white/5 text-white/40"
                  )}
                >
                  {x.lang}
                </span>
              ))}
            </div>
          </div>

          <div className="flex h-[380px] flex-col justify-end gap-2 px-3.5 py-4" key={dialog}>
            {d.msgs.slice(0, Math.min(shown, d.msgs.length)).map((m, i) => (
              <div key={i} className={cn("chat-pop flex", m.from === "ai" ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[84%] rounded-[1.1rem] px-3 py-2 text-[12.5px] leading-snug",
                    m.from === "ai" ? "rounded-bl-md bg-white/[0.08] text-white/90" : "rounded-br-md bg-[#5B4CED] text-white"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-[1.1rem] rounded-bl-md bg-white/[0.08] px-3 py-3">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 px-3.5 py-3">
            <span className="h-8 flex-1 rounded-full border border-white/10 px-3 text-[11px] leading-8 text-white/30">{t("Сообщение…")}</span>
          </div>
        </div>
      </div>

      {/* Заявка — выезжает, когда клиент оставил телефон */}
      <div
        className={cn(
          "absolute -bottom-8 -right-3 w-56 rounded-2xl border border-emerald-400/30 bg-[#0e1520] p-3.5 shadow-2xl transition-all duration-500 sm:-right-24",
          done ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0"
        )}
      >
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("Новая заявка в CRM")}
        </p>
        <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-white/85">
          <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" /> {t(d.lead)}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-white/85">
          <Phone className="h-3.5 w-3.5 text-white/40" /> {d.msgs[d.msgs.length - 1].text}
        </p>
      </div>

      {/* Язык ответа */}
      <div className="float-y absolute -left-6 top-24 hidden rounded-2xl border border-white/10 bg-[#121318]/95 px-3 py-2 shadow-2xl sm:-left-20 sm:block">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/80">
          <Sparkles className="h-3.5 w-3.5 text-[#8D82FF]" /> {t("Отвечает на языке клиента")}
        </p>
      </div>
    </div>
  );
}
