import { Montserrat_Alternates } from "next/font/google";
import { cn } from "@/lib/utils";

/**
 * Логотип DexaAI (исходники — brand/ в корне проекта): фиолетовая буква «D» в форме
 * облачка сообщения с искрой ИИ внутри. Тот же рисунок — в app/icon.svg и brand/dexaai-mark.svg.
 */

// Надпись «DexaAI» — широким геометрическим шрифтом с однобуквенной «a», как в логотипе.
// Только начертание 700 и только для логотипа: остальной сайт на Geist.
const wordmark = Montserrat_Alternates({ subsets: ["latin"], weight: "700", display: "swap" });

export const BRAND_PURPLE = "#5B4CED";
const BODY = "M18 15H52A30 30 0 0 1 52 75H32L18 85Z";
const SPARK = "M46 30.5C47.3 40.2 49.6 43.5 62 45C49.6 46.5 47.3 49.8 46 59.5C44.7 49.8 42.4 46.5 30 45C42.4 43.5 44.7 40.2 46 30.5Z";

/** Знак. tile — на тёмной плитке со скруглёнными углами (как иконка приложения). */
export function DexaMark({ size = 32, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  return (
    // Без плитки рамка обрезана по самому знаку (x 18–82, y 15–85), чтобы он занимал весь размер.
    <svg width={size} height={size} viewBox={tile ? "0 0 100 100" : "15 13 70 74"} className={cn("shrink-0", className)} aria-hidden="true">
      {tile && <rect width="100" height="100" rx="22" fill="#121318" />}
      <g transform={tile ? "translate(15 15) scale(0.7)" : undefined}>
        <path d={BODY} fill={BRAND_PURPLE} />
        <path d={SPARK} fill="#fff" />
      </g>
    </svg>
  );
}

/** Знак + надпись «DexaAI». tone="light" — белая надпись для тёмного фона; по умолчанию — цвет текста темы. */
export function DexaLogo({ size = 32, tone, className }: { size?: number; tone?: "dark" | "light"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: Math.round(size * 0.3) }}>
      <DexaMark size={size} />
      <span
        className={cn(wordmark.className, "leading-none tracking-[-0.01em]", tone === "light" ? "text-white" : tone === "dark" ? "text-[#121318]" : "text-slate-900")}
        style={{ fontSize: Math.round(size * 0.62) }}
      >
        Dexa<span style={{ color: tone === "light" ? "#8D82FF" : undefined }} className={tone === "light" ? undefined : "text-brand"}>AI</span>
      </span>
    </span>
  );
}

/** Только надпись «DexaAI» тем же шрифтом — для мест, где знак уже стоит рядом. */
export function DexaWordmark({ className }: { className?: string }) {
  return (
    <span className={cn(wordmark.className, "tracking-[-0.01em]", className)}>
      Dexa<span className="text-brand">AI</span>
    </span>
  );
}
