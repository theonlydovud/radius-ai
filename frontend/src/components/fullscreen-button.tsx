"use client";

import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «Во весь экран»: прячет адресную строку и вкладки браузера (удобно на электронной доске).
 * Браузер разрешает это только по нажатию. Где режим недоступен (iPhone), кнопки нет.
 */
export function FullscreenButton({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(!!document.documentElement.requestFullscreen && document.fullscreenEnabled);
    const sync = () => setActive(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  };
  const label = active ? "Выйти из полноэкранного режима" : "Во весь экран";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800",
        withLabel ? "px-3 text-sm" : "w-9",
        className
      )}
    >
      {active ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      {withLabel && <span>{active ? "Обычный режим" : "Во весь экран"}</span>}
    </button>
  );
}
