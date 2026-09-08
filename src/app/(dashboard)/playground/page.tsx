"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Sparkles, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SandboxChatMessage } from "@/types";
import { cn } from "@/lib/utils";

interface DisplayMessage extends SandboxChatMessage {
  id: string;
  isError?: boolean;
}

export default function PlaygroundPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      id: "welcome",
      role: "model",
      text: "Здравствуйте! Это тестовая песочница ИИ-консультанта Radius Logistics. Напишите сообщение так, как это сделал бы клиент в Instagram Direct или Telegram.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: "user", text };
    // История отправляется БЕЗ текущего сообщения — оно уже передаётся
    // отдельным полем "message". Если включить его в history тоже,
    // получится задвоенный "user"-ход подряд, из-за которого Gemini
    // теряет контекст предыдущих сообщений (см. normalizeHistory в
    // src/lib/gemini.ts — там та же защита стоит и на сервере).
    const historyForRequest = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, text: m.text }));
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyForRequest,
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "model",
          text: data.reply ?? data.error ?? "Не удалось получить ответ.",
          isError: Boolean(data.rateLimited || data.error),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "model",
          text: "Слишком большая нагрузка на сервера, повторите попытку через 1-2 минуты.",
          isError: true,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleReset() {
    setMessages([
      {
        id: "welcome",
        role: "model",
        text: "Диалог очищен. Начните новую тестовую переписку.",
      },
    ]);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Диалог с ИИ</h1>
          <p className="mt-1 text-sm text-slate-500">
            Песочница для проверки поведения консультанта Gemini 2.5 Flash-Lite перед публикацией правил.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Очистить диалог
        </Button>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="thin-scroll flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-slate-900 text-white"
                      : m.isError
                      ? "flex items-start gap-2 bg-amber-50 text-amber-800"
                      : "bg-slate-100 text-slate-800"
                  )}
                >
                  {m.isError && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{m.text}</span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-3">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="ml-1 text-xs text-slate-400">ИИ печатает...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-slate-300" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Напишите как клиент, например: «Здравствуйте, нужна доставка груза из Ташкента»"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900"
            />
            <Button size="icon" onClick={handleSend} disabled={isTyping || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
