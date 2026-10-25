"use client";

import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

type InstagramConfig = {
  ready: boolean;
  env: Record<string, boolean>;
  redirect_uri: string;
  webhook_url: string;
  privacy_url: string;
};

const ENV_HINTS: Record<string, string> = {
  INSTAGRAM_APP_ID: "Instagram → API setup with Instagram login → Instagram app ID",
  INSTAGRAM_APP_SECRET: "там же → Instagram app secret",
  FRONTEND_URL: "адрес этого дашборда, https://…vercel.app",
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "любая строка, её же вписать в настройках вебхука",
  FACEBOOK_APP_SECRET: "App settings → Basic → App secret (для проверки подписи вебхуков)",
};
const REQUIRED = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "FRONTEND_URL"];

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">
        <p className="flex-1 truncate font-mono text-[11px] text-slate-700">{value}</p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 text-slate-400 hover:text-slate-700"
          title="Скопировать"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Чек-лист перед «Войти через Instagram»: какие переменные заданы на backend
 * и какие адреса вписать в Meta for Developers. Сообщает готовность через onReady.
 */
export function InstagramSetup({ onReady }: { onReady: (ready: boolean) => void }) {
  const [config, setConfig] = useState<InstagramConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/instagram/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        setConfig(json.data);
        onReady(!!json.data?.ready);
      })
      .catch(() => {
        setError("Backend не отвечает или работает старая версия — сделайте Manual Deploy на Render.");
        onReady(false);
      });
  }, [onReady]);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  if (!config) return <p className="text-xs text-slate-400">Проверяю настройки backend…</p>;

  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="space-y-1">
        {Object.entries(config.env).map(([name, ok]) => (
          <div key={name} className="flex items-start gap-1.5 text-xs">
            {ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <X className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", REQUIRED.includes(name) ? "text-red-500" : "text-amber-500")} />
            )}
            <p className={ok ? "text-slate-600" : REQUIRED.includes(name) ? "text-red-600" : "text-amber-700"}>
              <span className="font-mono">{name}</span>
              {!ok && <span className="text-slate-400"> — {ENV_HINTS[name]}</span>}
            </p>
          </div>
        ))}
        {!config.ready && (
          <p className="pt-1 text-xs text-red-600">Добавьте переменные в Render → Environment и дождитесь перезапуска.</p>
        )}
      </div>

      <div className="space-y-2">
        <CopyRow label="Business login settings → OAuth redirect URIs" value={config.redirect_uri} />
        <CopyRow label="Configure webhooks → Callback URL (поле messages)" value={config.webhook_url} />
        <CopyRow label="App settings → Basic → Privacy Policy URL (для режима Live)" value={config.privacy_url} />
      </div>

      <p className="text-xs text-slate-500">
        Нужен профессиональный аккаунт (Business или Creator), добавленный в App roles → Instagram Testers и
        принявший приглашение. Откроется окно входа Instagram — войдите именно в тот аккаунт, который подключаете.
      </p>
    </div>
  );
}
