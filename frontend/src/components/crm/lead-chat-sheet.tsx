"use client";

import { isGenericLead, LeadRequest } from "@/components/lead-request";
import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bot, Loader2, MapPin, Package, Phone, Weight, X } from "lucide-react";
import { cn, dayKey, formatDay, formatTime } from "@/lib/utils";
import type { Lead, Message } from "@/types";
import { t } from "@/lib/i18n";

/** Переписка ИИ с клиентом по заявке — выезжает справа (на телефоне — на весь экран). */
export function LeadChatSheet({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lead) return;
    let cancelled = false;
    setMessages(null);
    setError("");
    fetch(`/api/messages?session_id=${lead.session_id}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) setMessages(json.data ?? []);
      })
      .catch((e) => !cancelled && setError(e?.message || t("Не удалось загрузить переписку.")));
    return () => {
      cancelled = true;
    };
  }, [lead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const d = lead?.collected_data;

  return (
    <DialogPrimitive.Root open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full sm:max-w-md">
          {lead && (
            <>
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-base font-semibold text-slate-900">{lead.client_name}</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-xs text-slate-500">{t("Переписка в Instagram Direct")}</DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t("Закрыть")}>
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
                  <a href={`tel:${lead.client_phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 font-medium text-brand hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {lead.client_phone}
                  </a>
                  {isGenericLead(d) ? (
                    <LeadRequest d={d} className="sm:col-span-2" />
                  ) : (
                    <>
                      <p className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{d?.origin_city ?? "—"} → {d?.destination_city ?? "—"}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Weight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{d?.weight ?? t("вес не указан")}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{d?.cargo_type ?? t("груз не указан")}</span>
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="thin-scroll flex-1 overflow-y-auto bg-slate-50/60 p-4">
                {error ? (
                  <p className="text-sm text-red-600">{error}</p>
                ) : !messages ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-400">{t("Сообщений нет.")}</p>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m, i) => {
                      const newDay = i === 0 || dayKey(m.created_at) !== dayKey(messages[i - 1].created_at);
                      const mine = m.sender !== "user";
                      return (
                        <div key={m.id}>
                          {newDay && <p className="my-3 text-center text-[11px] font-medium text-slate-400">{formatDay(m.created_at)}</p>}
                          <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                                mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-slate-200 bg-surface text-slate-800"
                              )}
                            >
                              {m.sender === "ai" && (
                                <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-white/70">
                                  <Bot className="h-3 w-3" /> DexaAI
                                </p>
                              )}
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                              <p className={cn("mt-1 text-right text-[10px]", mine ? "text-white/60" : "text-slate-400")}>{formatTime(m.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
