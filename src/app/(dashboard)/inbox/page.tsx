"use client";

import { useEffect, useState } from "react";
import { Instagram, Send as TelegramIcon, UserCog, Inbox as InboxIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { ChatSession, Message, SessionStatus } from "@/types";

const STATUS_LABEL: Record<SessionStatus, string> = {
  ai_active: "Ведёт ИИ",
  manager_takeover: "Перехвачено",
  closed: "Закрыт",
};

const STATUS_VARIANT: Record<SessionStatus, "accent" | "warning" | "secondary"> = {
  ai_active: "accent",
  manager_takeover: "warning",
  closed: "secondary",
};

export default function InboxPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingSessions(true);
      const res = await fetch("/api/sessions");
      const data = await res.json();
      const list: ChatSession[] = data.data ?? [];
      setSessions(list);
      if (list.length) setActiveId(list[0].id);
      setLoadingSessions(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    (async () => {
      setLoadingMessages(true);
      const res = await fetch(`/api/messages?session_id=${activeId}`);
      const data = await res.json();
      setMessages(data.data ?? []);
      setLoadingMessages(false);
    })();
  }, [activeId]);

  async function handleTakeover(session: ChatSession) {
    const nextStatus: SessionStatus =
      session.status === "manager_takeover" ? "ai_active" : "manager_takeover";
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, status: nextStatus } : s))
    );
  }

  const active = sessions.find((s) => s.id === activeId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">История чатов</h1>
        <p className="mt-1 text-sm text-slate-500">
          Все диалоги клиентов с ИИ. Перехватите диалог, чтобы ответить лично.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <Card className="flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden">
          <div className="thin-scroll flex-1 overflow-y-auto">
            {loadingSessions ? (
              <p className="p-5 text-sm text-slate-400">Загрузка...</p>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <InboxIcon className="h-5 w-5 text-slate-300" />
                <p className="text-sm text-slate-400">Диалогов пока нет.</p>
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left transition-colors hover:bg-slate-50",
                    activeId === s.id && "bg-slate-50"
                  )}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    {s.accounts?.platform === "telegram" ? (
                      <TelegramIcon className="h-4 w-4 text-slate-500" />
                    ) : (
                      <Instagram className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">{s.client_name}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{formatDate(s.created_at)}</p>
                    <Badge variant={STATUS_VARIANT[s.status]} className="mt-1.5">
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Выберите диалог слева
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{active.client_name}</p>
                  <p className="text-xs text-slate-400">
                    {active.accounts?.platform === "telegram" ? "Telegram" : "Instagram Direct"} ·{" "}
                    {active.accounts?.account_name}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={active.status === "manager_takeover" ? "secondary" : "outline"}
                  onClick={() => handleTakeover(active)}
                >
                  <UserCog className="h-3.5 w-3.5" />
                  {active.status === "manager_takeover" ? "Вернуть ИИ" : "Перехватить диалог"}
                </Button>
              </div>

              <div className="thin-scroll flex-1 overflow-y-auto p-5">
                {loadingMessages ? (
                  <p className="text-sm text-slate-400">Загрузка сообщений...</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn("flex", m.sender === "user" ? "justify-start" : "justify-end")}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-xl px-4 py-2 text-sm",
                            m.sender === "user"
                              ? "bg-slate-100 text-slate-800"
                              : m.sender === "manager"
                              ? "bg-indigo-50 text-indigo-900"
                              : "bg-slate-900 text-white"
                          )}
                        >
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
