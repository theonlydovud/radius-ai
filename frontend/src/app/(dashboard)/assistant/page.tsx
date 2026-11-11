"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, MapPin, Mic, Package, Phone, SendHorizontal, Sparkles, Square, Trash2, UserRound } from "lucide-react";
import { useAccountId } from "@/components/account-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lostReasonLabel, STATUS_LABEL, STATUS_VARIANT } from "@/lib/lead-meta";
import { t } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import type { Lead } from "@/types";

/**
 * ИИ-ассистент панели руководителя: текстом или голосом.
 * «Отправь заявку Хуршиду, груз из Ташкента в Поти, 50 тонн шёлка», «Покажи статистику за прошлую неделю».
 * Ответ — текст + карточки действий (заявка, статистика, список). История живёт в этой вкладке браузера.
 */

type Action =
  | { type: "lead"; verb: "created" | "updated"; lead: Lead }
  | { type: "stats"; from: string; to: string; manager: string | null; stats: any }
  | { type: "leads"; title: string; leads: Lead[] };
type Msg = { role: "user" | "model"; text: string; actions?: Action[]; error?: boolean };

const STORE = "dexa.assistant";
const MAX_RECORD_MS = 60_000;
const EXAMPLES = [
  "Отправь заявку Хуршиду: груз из Ташкента в Поти, 50 тонн шёлка",
  "Покажи статистику за прошлую неделю",
  "Какие заявки сейчас в работе у Жасура?",
  "Сколько заявок не продано за этот месяц и почему?",
];

const ruDate = (d: string) => d.split("-").reverse().join(".");

// ---------------------------------------------------------------------
// Карточки действий
// ---------------------------------------------------------------------

function LeadCard({ lead, verb }: { lead: Lead; verb: "created" | "updated" }) {
  const d = lead.collected_data ?? {};
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">{verb === "created" ? t("Заявка создана") : t("Заявка обновлена")}</p>
        <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
      </div>
      <p className="mt-2 text-base font-semibold text-slate-900">{lead.client_name}</p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
        <p className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          {d.origin_city ?? "—"} → {d.destination_city ?? "—"}
        </p>
        <p className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-slate-400" />
          {[d.weight, d.cargo_type].filter(Boolean).join(" · ") || t("груз не указан")}
        </p>
        <p className="flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5 text-slate-400" />
          {lead.manager?.name ?? t("Без ответственного")}
        </p>
        <p className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          {lead.client_phone || t("телефон не указан")}
        </p>
      </div>
      {lead.status === "not_sold" && <p className="mt-2 text-xs text-slate-500">{t("Причина:")} {lostReasonLabel(lead.lost_reason)}</p>}
      <Link href={`/leads?lead=${lead.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
        {t("Открыть в заявках")}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function StatsCard({ a }: { a: Extract<Action, { type: "stats" }> }) {
  const s = a.stats.totals;
  const tiles = [
    { label: "Всего", value: s.total },
    { label: "Новые", value: s.new },
    { label: "В работе", value: s.in_progress },
    { label: "Продано", value: s.sold },
    { label: "Не продано", value: s.not_sold },
    { label: "Конверсия", value: s.conversion === null ? "—" : `${s.conversion}%` },
  ];
  const reasons = (a.stats.reasons ?? []).filter((r: any) => r.count > 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-brand">
        {t("Статистика")} · {a.from === a.to ? ruDate(a.from) : `${ruDate(a.from)} — ${ruDate(a.to)}`}
        {a.manager ? ` · ${a.manager}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-lg bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] text-slate-500">{t(x.label)}</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{x.value}</p>
          </div>
        ))}
      </div>
      {!a.manager && a.stats.managers?.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1 font-medium">{t("Менеджер")}</th>
              <th className="pb-1 text-right font-medium">{t("Получил")}</th>
              <th className="pb-1 text-right font-medium">{t("Продал")}</th>
              <th className="pb-1 text-right font-medium">{t("Конверсия")}</th>
            </tr>
          </thead>
          <tbody>
            {a.stats.managers.map((m: any) => (
              <tr key={m.id ?? "none"} className="border-t border-slate-100 tabular-nums">
                <td className="py-1.5 text-slate-700">{m.name}</td>
                <td className="py-1.5 text-right text-slate-900">{m.received}</td>
                <td className="py-1.5 text-right text-slate-900">{m.sold}</td>
                <td className="py-1.5 text-right text-slate-900">{m.conversion === null ? "—" : `${m.conversion}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {reasons.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {t("Причины отказа")}: {reasons.map((r: any) => `${lostReasonLabel(r.reason)} — ${r.count}`).join(", ")}
        </p>
      )}
    </div>
  );
}

function LeadsCard({ leads, total }: { leads: Lead[]; total: string }) {
  if (!leads.length) return <div className="rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-500">{t("Заявок не найдено.")}</div>;
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-2">
      <p className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-brand">{t("Найдено заявок: {0}", total)}</p>
      <ul>
        {leads.map((l) => {
          const d = l.collected_data ?? {};
          return (
            <li key={l.id}>
              <Link href={`/leads?lead=${l.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{l.client_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {d.origin_city ?? "—"} → {d.destination_city ?? "—"} · {l.manager?.name ?? t("Без ответственного")} · {formatDate(l.created_at)}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[l.status]} className="shrink-0">
                  {STATUS_LABEL[l.status]}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Голос
// ---------------------------------------------------------------------

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------

export default function AssistantPage() {
  const accountId = useAccountId();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORE);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-40)));
    } catch {
      /* private mode */
    }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
      setMessages((prev) => [...prev, { role: "user", text: message }]);
      setInput("");
      setBusy(true);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history, account_id: accountId ?? null }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? t("Ассистент не смог ответить. Попробуйте ещё раз."));
        setMessages((prev) => [...prev, { role: "model", text: json.data.reply, actions: json.data.actions }]);
      } catch (e: any) {
        setMessages((prev) => [...prev, { role: "model", text: t(e?.message || "Ассистент не смог ответить. Попробуйте ещё раз."), error: true }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, accountId]
  );

  // Запись голоса: нажали — пишем, нажали ещё раз (или прошла минута) — расшифровываем и отправляем.
  async function toggleRecording() {
    setVoiceError("");
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError(t("Этот браузер не умеет записывать голос."));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError(t("Нет доступа к микрофону. Разрешите его в настройках браузера."));
      return;
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    const tick = setInterval(() => {
      const ms = Date.now() - started;
      setSeconds(Math.floor(ms / 1000));
      if (ms >= MAX_RECORD_MS && rec.state === "recording") rec.stop();
    }, 250);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      clearInterval(tick);
      stream.getTracks().forEach((tr) => tr.stop());
      setRecording(false);
      setSeconds(0);
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      if (blob.size < 1500) return; // случайное касание
      setTranscribing(true);
      try {
        const res = await fetch("/api/assistant/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: await blobToBase64(blob), mime: blob.type }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? t("Не удалось распознать голос."));
        const text = String(json.data?.text ?? "").trim();
        if (!text) setVoiceError(t("Не расслышал — попробуйте ещё раз."));
        else send(text);
      } catch (e: any) {
        setVoiceError(t(e?.message || "Не удалось распознать голос."));
      } finally {
        setTranscribing(false);
      }
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-brand" />
            {t("ИИ ассистент")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("Создаёт и меняет заявки, показывает статистику. Пишите или говорите голосом.")}</p>
        </div>
        {!empty && (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("Очистить")}
          </Button>
        )}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-surface/60 p-4 sm:p-6">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3D6BFF] via-[#5B4BFF] to-[#A445F5] shadow-[0_10px_40px_-10px_rgba(91,75,255,0.7)]">
              <Sparkles className="h-8 w-8 text-white" />
            </span>
            <p className="mt-5 text-xl font-semibold text-slate-900">{t("Чем помочь?")}</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">{t("Например:")}</p>
            <div className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(t(ex))}
                  className="rounded-xl border border-slate-200 bg-surface px-4 py-3 text-left text-sm text-slate-700 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm"
                >
                  {t(ex)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">{m.text}</p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D6BFF] to-[#A445F5]">
                    <Sparkles className="h-4 w-4 text-white" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className={cn("whitespace-pre-wrap text-sm leading-relaxed", m.error ? "text-red-600" : "text-slate-800")}>{m.text}</p>
                    {m.actions?.map((a, j) =>
                      a.type === "lead" ? (
                        <LeadCard key={j} lead={a.lead} verb={a.verb} />
                      ) : a.type === "stats" ? (
                        <StatsCard key={j} a={a} />
                      ) : (
                        <LeadsCard key={j} leads={a.leads} total={a.title} />
                      )
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#3D6BFF] to-[#A445F5]">
                  <Sparkles className="h-4 w-4 animate-pulse text-white" />
                </span>
                {t("Думаю...")}
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className={cn("flex items-end gap-2 rounded-2xl border bg-surface p-2 shadow-sm transition", recording ? "border-red-400 ring-2 ring-red-400/30" : "border-slate-200 focus-within:border-brand/50")}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={recording ? t("Говорите… нажмите ещё раз, чтобы отправить") : transcribing ? t("Распознаю голос…") : t("Напишите задачу или нажмите на микрофон")}
            disabled={recording || transcribing}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={toggleRecording}
            disabled={transcribing || busy}
            aria-label={recording ? t("Остановить запись") : t("Сказать голосом")}
            title={recording ? t("Остановить запись") : t("Сказать голосом")}
            className={cn(
              "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium transition disabled:opacity-50",
              recording ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
            {recording && <span className="tabular-nums">0:{String(seconds).padStart(2, "0")}</span>}
          </button>
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={!input.trim() || busy || recording} aria-label={t("Отправить")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
        {voiceError && <p className="mt-2 text-xs text-red-600">{voiceError}</p>}
      </form>
    </div>
  );
}
