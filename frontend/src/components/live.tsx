"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, MapPin, Package, UserRound, Volume2, VolumeX } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types";

/**
 * Live-режим для экрана на стене (страница супер-админа): звук и всплывающая карточка
 * новой заявки. Звук синтезируется Web Audio — файла нет. Браузер разрешает звук только
 * после первого касания страницы, поэтому пока звук «спит», показываем подсказку.
 */

const SOUND_KEY = "dexa.liveSound";

export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      /* private mode */
    }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    ctxRef.current = ctx;
    setBlocked(ctx.state !== "running");
    // Первое касание страницы «будит» звук.
    const wake = () => ctx.resume().then(() => setBlocked(ctx.state !== "running")).catch(() => {});
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      ctx.close().catch(() => {});
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      try {
        window.localStorage.setItem(SOUND_KEY, v ? "off" : "on");
      } catch {
        /* private mode */
      }
      return !v;
    });
  }, []);

  /** Три восходящие ноты (до–ми–соль) с мягким затуханием. */
  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !enabled || ctx.state !== "running") return;
    const now = ctx.currentTime;
    [1046.5, 1318.5, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
  }, [enabled]);

  return { play, enabled, toggle, blocked };
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-red-600">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      Live
    </span>
  );
}

export function SoundToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-surface px-3 text-xs text-slate-600 hover:bg-slate-50"
      aria-pressed={enabled}
    >
      {enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      {enabled ? t("Звук включён") : t("Звук выключен")}
    </button>
  );
}

/** Подсказка, пока браузер не разрешил звук. */
export function SoundUnlockHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      <BellRing className="h-4 w-4 shrink-0" />
      {t("Нажмите в любом месте страницы, чтобы включить звук новых заявок.")}
    </div>
  );
}

/** Крупная карточка поверх экрана на несколько секунд. */
export function NewLeadAlert({ lead, onDone }: { lead: Lead | null; onDone: () => void }) {
  useEffect(() => {
    if (!lead) return;
    const timer = setTimeout(onDone, 8000);
    return () => clearTimeout(timer);
  }, [lead, onDone]);

  if (!lead) return null;
  const d = lead.collected_data ?? {};
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <div
        className="new-lead-alert pointer-events-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[#eda100]/40 bg-surface shadow-2xl"
        onClick={onDone}
      >
        <div className="flex items-center gap-2 bg-gradient-to-r from-[#eda100] to-[#eb6834] px-5 py-2.5 text-sm font-semibold text-white">
          <BellRing className="h-4 w-4 animate-[wiggle_0.6s_ease-in-out_3]" />
          {t("Новая заявка")}
        </div>
        <div className="space-y-2 px-5 py-4">
          <p className="text-xl font-semibold text-slate-900">{lead.client_name}</p>
          <p className="flex items-center gap-2 text-base text-slate-700">
            <MapPin className="h-4 w-4 text-slate-400" />
            {d.origin_city ?? "—"} → {d.destination_city ?? "—"}
          </p>
          {(d.weight || d.cargo_type) && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Package className="h-4 w-4 text-slate-400" />
              {[d.weight, d.cargo_type].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className={cn("flex items-center gap-2 text-sm", lead.manager ? "text-slate-600" : "text-amber-600")}>
            <UserRound className="h-4 w-4 text-slate-400" />
            {lead.manager?.name ?? t("Без ответственного")}
          </p>
        </div>
        <div className="new-lead-progress h-1 bg-[#eda100]" />
      </div>
    </div>
  );
}
