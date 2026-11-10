import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Знак DexaAI: буква «D» с ядром внутри (ИИ, который держит разговор) и искрой.
 * Градиент синий → индиго → фиолетовый; тот же рисунок лежит в app/icon.svg.
 */
export function DexaMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn("shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`dx-${id}`} x1="4" y1="2" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3D6BFF" />
          <stop offset="0.55" stopColor="#5B4BFF" />
          <stop offset="1" stopColor="#A445F5" />
        </linearGradient>
        <radialGradient id={`dg-${id}`} cx="0.3" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#dx-${id})`} />
      <rect width="40" height="40" rx="11" fill={`url(#dg-${id})`} />
      <path d="M12.5 10.5h6.8a9.5 9.5 0 0 1 0 19h-6.8z" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="19.3" cy="20" r="3.1" fill="#fff" />
      <path d="M31 7.2l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/** Знак + надпись «DexaAI». tone="light" — для тёмного фона лендинга. */
export function DexaLogo({
  size = 32,
  tone = "dark",
  className,
}: {
  size?: number;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <DexaMark size={size} />
      <span
        className={cn("font-semibold tracking-tight", tone === "light" ? "text-white" : "text-slate-900")}
        style={{ fontSize: Math.round(size * 0.56) }}
      >
        Dexa
        <span className="bg-gradient-to-r from-[#3D6BFF] via-[#5B4BFF] to-[#A445F5] bg-clip-text text-transparent">AI</span>
      </span>
    </span>
  );
}
