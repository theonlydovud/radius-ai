"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Loader2, Plus, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ManagersCard } from "@/components/managers-card";
import { cn } from "@/lib/utils";

type LeadNotifySettings = {
  enabled: boolean;
  chat_ids: string[];
  effective_chat_ids: string[];
  bot_token_preview: string;
  token_source: "settings" | "env" | "none";
  bot_username: string | null;
};

type FoundChat = { id: string; title: string; type: string };
type Notice = { ok: boolean; text: string } | null;

const API = "/api/settings/lead-notifications";

export default function SettingsPage() {
  const [settings, setSettings] = useState<LeadNotifySettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [newChatId, setNewChatId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "find" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [testResults, setTestResults] = useState<{ chat_id: string; ok: boolean; error?: string }[]>([]);
  const [foundChats, setFoundChats] = useState<FoundChat[] | null>(null);

  function apply(data: LeadNotifySettings) {
    setSettings(data);
    setEnabled(data.enabled);
    setChatIds(data.chat_ids);
  }

  useEffect(() => {
    fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => json.data && apply(json.data))
      .catch(() => setNotice({ ok: false, text: "Не удалось загрузить настройки." }));
  }, []);

  const dirty =
    !!settings &&
    (enabled !== settings.enabled || botToken.trim() !== "" || chatIds.join(",") !== settings.chat_ids.join(","));

  function addChatId(id: string) {
    const v = id.trim();
    if (!v || chatIds.includes(v)) return;
    setChatIds((prev) => [...prev, v]);
    setNewChatId("");
  }

  async function save(): Promise<boolean> {
    setBusy("save");
    setNotice(null);
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          chat_ids: chatIds,
          ...(botToken.trim() ? { bot_token: botToken.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice({ ok: false, text: json.error ?? "Не удалось сохранить." });
        return false;
      }
      apply(json.data);
      setBotToken("");
      setNotice({ ok: true, text: "Настройки сохранены." });
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    // Тестируем то, что видно на экране: сначала сохраняем несохранённые изменения.
    if (dirty && !(await save())) return;
    setBusy("test");
    setTestResults([]);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const json = await res.json();
      if (!res.ok) setNotice({ ok: false, text: json.error ?? "Не удалось отправить." });
      else setTestResults(json.data ?? []);
    } finally {
      setBusy(null);
    }
  }

  async function findChats() {
    if (botToken.trim() && !(await save())) return;
    setBusy("find");
    setFoundChats(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "find_chats" }),
      });
      const json = await res.json();
      if (!res.ok) setNotice({ ok: false, text: json.error ?? "Не удалось получить список." });
      else setFoundChats(json.data ?? []);
    } finally {
      setBusy(null);
    }
  }

  const usingEnvChats = settings && chatIds.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Настройки</h1>
        <p className="mt-1 text-sm text-slate-500">Куда отправлять уведомления о новых заявках и кто их получает.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
              <Bell className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <CardTitle>Заявки в Telegram</CardTitle>
              <p className="text-xs text-slate-400">Новая заявка сразу приходит в бота на указанные ID.</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!settings} />
        </CardHeader>

        <CardContent className="space-y-5">
          {!settings ? (
            <p className="text-sm text-slate-400">Загрузка...</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Бот</Label>
                <p className="text-xs text-slate-500">
                  {settings.token_source === "none"
                    ? "Токен не задан — укажите токен бота от @BotFather."
                    : `${settings.bot_username ? `@${settings.bot_username}` : "Бот"} · ${settings.bot_token_preview}${
                        settings.token_source === "env" ? " (из переменных окружения)" : ""
                      }`}
                </p>
                <Input
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  type="password"
                  placeholder={settings.token_source === "none" ? "123456:ABC…" : "Новый токен — оставьте пустым, чтобы не менять"}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Кому отправлять (Telegram ID)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {chatIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                    >
                      {id}
                      <button
                        onClick={() => setChatIds((prev) => prev.filter((x) => x !== id))}
                        className="text-slate-400 hover:text-red-500"
                        title="Убрать"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {usingEnvChats &&
                    (settings.effective_chat_ids.length > 0 ? (
                      <span className="text-xs text-slate-400">
                        Не задано — используется {settings.effective_chat_ids.join(", ")} (из переменных окружения)
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">
                        Получатели не указаны — заявки сейчас никуда не отправляются.
                      </span>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addChatId(newChatId)}
                    placeholder="123456789, -1001234567890 или @channel"
                  />
                  <Button variant="outline" size="sm" onClick={() => addChatId(newChatId)} disabled={!newChatId.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                    Добавить
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Получатель должен открыть {settings.bot_username ? `@${settings.bot_username}` : "бота"} и нажать
                  /start — иначе Telegram не даст боту написать первым. Для группы добавьте бота в группу.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={save} disabled={!dirty || busy !== null}>
                  {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Сохранить
                </Button>
                <Button variant="outline" size="sm" onClick={sendTest} disabled={busy !== null || settings.token_source === "none" && !botToken.trim()}>
                  {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Отправить тест
                </Button>
                <Button variant="outline" size="sm" onClick={findChats} disabled={busy !== null || settings.token_source === "none" && !botToken.trim()}>
                  {busy === "find" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Найти мой ID
                </Button>
              </div>

              {notice && (
                <p className={cn("text-xs", notice.ok ? "text-emerald-600" : "text-red-600")}>{notice.text}</p>
              )}

              {testResults.length > 0 && (
                <ul className="space-y-1">
                  {testResults.map((r) => (
                    <li key={r.chat_id} className={cn("text-xs", r.ok ? "text-emerald-600" : "text-red-600")}>
                      {r.chat_id || "—"}: {r.ok ? "доставлено" : r.error}
                    </li>
                  ))}
                </ul>
              )}

              {foundChats && (
                <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  {foundChats.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Боту пока никто не писал. Откройте {settings.bot_username ? `@${settings.bot_username}` : "бота"},
                      нажмите /start и повторите поиск.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500">Недавно писали боту:</p>
                      {foundChats.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-700">
                            {c.title} <span className="text-slate-400">· {c.id}</span>
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            disabled={chatIds.includes(c.id)}
                            onClick={() => addChatId(c.id)}
                          >
                            {chatIds.includes(c.id) ? "Добавлен" : "Добавить"}
                          </Button>
                        </div>
                      ))}
                      <p className="text-xs text-slate-400">После добавления нажмите «Сохранить».</p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ManagersCard />
    </div>
  );
}
