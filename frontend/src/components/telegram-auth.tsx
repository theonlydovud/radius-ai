"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { getLang, t } from "@/lib/i18n";
import { goToWorkspace } from "@/lib/workspace";

/**
 * Регистрация и вход в один клик через Telegram-бота DexaAI.
 * 1) Сайт получает одноразовую ссылку t.me/<бот>?start=<код> и открывает её.
 * 2) Человек жмёт Start в боте — бот подтверждает код (и создаёт аккаунт, если его нет).
 * 3) Страница, опрашивая код, видит подтверждение и входит: новичок — в кабинет, клиент — в рабочее место.
 */

const POLL_MS = 2000;

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.78 15.16 9.6 19.3c.36 0 .52-.16.71-.34l1.7-1.63 3.53 2.58c.65.36 1.11.17 1.29-.6l2.33-10.94c.21-.97-.35-1.35-.98-1.12L4.44 12.4c-.94.37-.93.9-.16 1.14l3.51 1.09 8.15-5.14c.38-.25.73-.11.45.14z"
      />
    </svg>
  );
}

type Phase = "idle" | "starting" | "waiting" | "done" | "expired" | "error";

/** plan — тариф, выбранный при регистрации: пробный период пойдёт на нём (при входе не нужен). */
export function TelegramAuthButton({ label, plan }: { label: string; plan?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const nonceRef = useRef("");
  const finishing = useRef(false);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const res = await fetch("/api/signup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: nonceRef.current }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Ссылка устарела. Попробуйте ещё раз.");
      setPhase("done");
      const { next, company } = json.data;
      // Компания с поддоменом — на свой адрес, остальные остаются на dexa.uz.
      goToWorkspace(next, router, company, true);
    } catch (e: any) {
      finishing.current = false;
      setError(t(e?.message || "Ссылка устарела. Попробуйте ещё раз."));
      setPhase("expired");
    }
  }, [router]);

  const check = useCallback(async () => {
    if (!nonceRef.current || finishing.current) return;
    try {
      const res = await fetch(`/api/signup/status?nonce=${encodeURIComponent(nonceRef.current)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const status = json.data?.status;
      if (status === "confirmed") await finish();
      else if (status === "expired" || status === "used" || status === "unknown") setPhase("expired");
    } catch {
      /* сеть моргнула — следующий опрос */
    }
  }, [finish]);

  // Опрос, пока ждём нажатия Start. При возврате во вкладку — проверяем сразу.
  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, check]);

  async function begin() {
    setError("");
    setPhase("starting");
    finishing.current = false;
    // Окно открываем сразу по клику — иначе браузер заблокирует его как всплывающее.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch("/api/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: getLang(), plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Регистрация через Telegram временно недоступна.");
      nonceRef.current = json.data.nonce;
      setLink(json.data.url);
      if (tab) tab.location.href = json.data.url;
      setPhase("waiting");
    } catch (e: any) {
      tab?.close();
      setError(t(e?.message || "Регистрация через Telegram временно недоступна."));
      setPhase("error");
    }
  }

  if (phase === "waiting" || phase === "done") {
    return (
      <div className="rounded-xl border border-[#2AABEE]/30 bg-[#2AABEE]/5 p-4 text-sm">
        {phase === "done" ? (
          <p className="flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {t("Готово! Входим...")}
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium text-slate-900">
              <Loader2 className="h-4 w-4 animate-spin text-[#2AABEE]" />
              {t("Нажмите «Start» в Telegram")}
            </p>
            <p className="mt-1 text-slate-500">{t("Как только нажмёте — вернитесь сюда, вход выполнится сам.")}</p>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1c93d1] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("Telegram не открылся? Нажмите здесь")}
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={begin}
        disabled={phase === "starting"}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2AABEE] text-sm font-semibold text-white transition hover:bg-[#229ED9] disabled:opacity-60"
      >
        {phase === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TelegramIcon className="h-5 w-5" />}
        {label}
      </button>
      {phase === "expired" && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <RotateCcw className="h-3.5 w-3.5" />
          {error || t("Ссылка устарела. Нажмите кнопку ещё раз.")}
        </p>
      )}
      {phase === "error" && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
