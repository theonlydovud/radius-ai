"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, MapPin, Package, Phone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * Пример диалога в Direct, который заканчивается заявкой. Проигрывается по кругу,
 * пока блок на экране; при reduced motion показан целиком без анимации.
 */
const SCRIPT: { from: "client" | "ai"; text: string }[] = [
  { from: "client", text: "Здравствуйте! Нужно привезти груз из Китая в Ташкент" },
  { from: "ai", text: "Здравствуйте! Подскажите, что везём и примерный вес или объём?" },
  { from: "client", text: "Мебель, около 5 тонн" },
  { from: "ai", text: "Понял. Оставьте номер телефона — логист свяжется с вами и рассчитает стоимость." },
  { from: "client", text: "+998 90 123 45 67" },
];

const STEP_MS = 1500;

export function ChatDemo() {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const total = SCRIPT.length + 1; // + карточка заявки

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(total);
      return;
    }
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.3 });
    if (box.current) io.observe(box.current);

    let step = 0;
    const timer = setInterval(() => {
      if (!visible) return;
      step = step >= total + 2 ? 0 : step + 1; // пауза на готовой заявке, потом заново
      const next = Math.min(step, total);
      setTyping(next < SCRIPT.length && SCRIPT[next]?.from === "ai");
      setShown(next);
    }, STEP_MS);
    return () => {
      clearInterval(timer);
      io.disconnect();
    };
  }, [total]);

  return (
    <div ref={box} className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-[#7A6CFF]/30 via-[#5B4CED]/20 to-[#8E5CF7]/30 blur-2xl" />
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0d1a]/90 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-medium text-white">{t("Клиент")}</p>
            <p className="text-[11px] text-white/50">{t("Instagram Direct · пример диалога")}</p>
          </div>
        </div>

        <div className="flex h-[23rem] flex-col justify-end gap-2 px-4 py-4">
          {SCRIPT.slice(0, Math.min(shown, SCRIPT.length)).map((m, i) => (
            <div key={i} className={cn("chat-pop flex", m.from === "ai" ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug",
                  m.from === "ai"
                    ? "rounded-bl-md border border-white/10 bg-white/[0.06] text-white/90"
                    : "rounded-br-md bg-gradient-to-br from-[#7A6CFF] to-[#5B4CED] text-white"
                )}
              >
                {m.from === "ai" && (
                  <span className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[#9db4ff]">
                    <Bot className="h-3 w-3" /> DexaAI
                  </span>
                )}
                {t(m.text)}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-3 py-3">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/60" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "absolute -bottom-10 -right-2 w-64 rounded-2xl border border-emerald-400/30 bg-[#0d1424]/95 p-4 shadow-2xl backdrop-blur transition-all duration-500 sm:-right-10",
          shown >= total ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> {t("Заявка создана")}
        </p>
        <div className="mt-2 space-y-1 text-[13px] text-white/85">
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-white/40" /> {t("Китай → Ташкент")}
          </p>
          <p className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-white/40" /> {t("Мебель · 5 т")}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-white/40" /> +998 90 123 45 67
          </p>
        </div>
        <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/50">{t("Передана следующему менеджеру по очереди")}</p>
      </div>
    </div>
  );
}
