"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Loader2, Plus, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ManagersCard } from "@/components/managers-card";
import { InstagramAccountsCard } from "@/components/instagram-accounts-card";
import { hasFeature, useCurrentUser } from "@/components/current-user";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type LeadNotifySettings = {
  enabled: boolean;
  chat_ids: string[];
  effective_chat_ids: string[];
  group_chat_id: string | null;
  owner_chat_id: string | null;
  bot_token_preview: string;
  token_source: "settings" | "env" | "none";
  bot_username: string | null;
};

type FoundChat = { id: string; title: string; type: string };
type Notice = { ok: boolean; text: string } | null;

const API = "/api/settings/lead-notifications";

/** Telegram-группа заявок — отдельная услуга (бот заявок); без неё в настройках только менеджеры. */
export default function SettingsPage() {
  const { company } = useCurrentUser();
  if (company.telegram_leads) return <TelegramSettingsPage />;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">{t("Настройки")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("Instagram, менеджеры и очередь заявок.")}</p>
      </div>
      <InstagramAccountsCard />
      <Card className="max-w-2xl">
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
            <Bell className="h-4 w-4 text-brand" />
          </div>
          <div>
            <CardTitle>{t("Заявки в Telegram")}</CardTitle>
            <p className="text-xs text-slate-400">{t("Уведомления о новых заявках в вашу Telegram-группу подключаются вместе с постоянным тарифом.")}</p>
          </div>
        </CardHeader>
      </Card>
      {hasFeature(company, "lead_transfer") ? <ManagersCard /> : (
        <p className="mt-6 max-w-2xl rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
          {t("Менеджеры, очередь заявок и передача заявок открываются на тарифах Business и Pro.")}
        </p>
      )}
    </div>
  );
}

function TelegramSettingsPage() {
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
      .catch(() => setNotice({ ok: false, text: t("Не удалось загрузить настройки.") }));
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
        setNotice({ ok: false, text: json.error ?? t("Не удалось сохранить.") });
        return false;
      }
      apply(json.data);
      setBotToken("");
      setNotice({ ok: true, text: t("Настройки сохранены.") });
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
      if (!res.ok) setNotice({ ok: false, text: json.error ?? t("Не удалось отправить.") });
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
      if (!res.ok) setNotice({ ok: false, text: json.error ?? t("Не удалось получить список.") });
      else setFoundChats(json.data ?? []);
    } finally {
      setBusy(null);
    }
  }

  const usingEnvChats = settings && chatIds.length === 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">{t("Настройки")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("Instagram-аккаунты, уведомления о новых заявках и менеджеры.")}</p>
      </div>

      <InstagramAccountsCard />
      <Card className="max-w-2xl">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
              <Bell className="h-4 w-4 text-brand" />
            </div>
            <div>
              <CardTitle>{t("Заявки в Telegram")}</CardTitle>
              <p className="text-xs text-slate-400">{t("Новая заявка сразу приходит в бота на указанные ID.")}</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!settings} />
        </CardHeader>

        <CardContent className="space-y-5">
          {!settings ? (
            <p className="text-sm text-slate-400">{t("Загрузка...")}</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>{t("Бот")}</Label>
                <p className="text-xs text-slate-500">
                  {settings.token_source === "none"
                    ? t("Токен не задан — укажите токен бота от @BotFather.")
                    : `${settings.bot_username ? `@${settings.bot_username}` : t("Бот")} · ${settings.bot_token_preview}${
                        settings.token_source === "env" ? t(" (из переменных окружения)") : ""
                      }`}
                </p>
                <Input
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  type="password"
                  placeholder={settings.token_source === "none" ? "123456:ABC…" : t("Новый токен — оставьте пустым, чтобы не менять")}
                />
              </div>

              <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <p>
                  {t("Группа:")}{" "}{settings.group_chat_id ?? <span className="text-amber-600">{t("не задана (TELEGRAM_LEADS_CHAT_ID)")}</span>}
                </p>
                <p>{t("Владелец в личку:")}{" "}{settings.owner_chat_id ?? t("не задан (TELEGRAM_OWNER_CHAT_ID)")}</p>
                <p className="text-slate-400">{t("Задаются переменными на Render. Если в группу не отправилось, заявка уходит владельцу.")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{t("Дополнительные получатели (Telegram ID)")}</Label>
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
                        title={t("Убрать")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {usingEnvChats &&
                    (settings.effective_chat_ids.length > 0 ? (
                      <span className="text-xs text-slate-400">{t("Нет — заявки получают только группа и владелец.")}</span>
                    ) : (
                      <span className="text-xs text-amber-600">
                        {t("Получатели не указаны — заявки сейчас никуда не отправляются.")}</span>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addChatId(newChatId)}
                    placeholder={t("123456789, -1001234567890 или @channel")}
                  />
                  <Button variant="outline" size="sm" onClick={() => addChatId(newChatId)} disabled={!newChatId.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("Добавить")}</Button>
                </div>
                <p className="text-xs text-slate-400">
                  {t("Получатель должен открыть")}{" "}{settings.bot_username ? `@${settings.bot_username}` : t("бота")} {" "}{t("и нажать /start — иначе Telegram не даст боту написать первым. Для группы добавьте бота в группу.")}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={save} disabled={!dirty || busy !== null}>
                  {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {t("Сохранить")}</Button>
                <Button variant="outline" size="sm" onClick={sendTest} disabled={busy !== null || settings.token_source === "none" && !botToken.trim()}>
                  {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {t("Отправить тест")}</Button>
                <Button variant="outline" size="sm" onClick={findChats} disabled={busy !== null || settings.token_source === "none" && !botToken.trim()}>
                  {busy === "find" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {t("Найти мой ID")}</Button>
              </div>

              {notice && (
                <p className={cn("text-xs", notice.ok ? "text-emerald-600" : "text-red-600")}>{notice.text}</p>
              )}

              {testResults.length > 0 && (
                <ul className="space-y-1">
                  {testResults.map((r) => (
                    <li key={r.chat_id} className={cn("text-xs", r.ok ? "text-emerald-600" : "text-red-600")}>
                      {r.chat_id || "—"}: {r.ok ? t("доставлено") : r.error}
                    </li>
                  ))}
                </ul>
              )}

              {foundChats && (
                <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  {foundChats.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      {t("Боту пока никто не писал. Откройте")}{" "}{settings.bot_username ? `@${settings.bot_username}` : t("бота")}{t(", нажмите /start и повторите поиск.")}</p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500">{t("Недавно писали боту:")}</p>
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
                            {chatIds.includes(c.id) ? t("Добавлен") : t("Добавить")}
                          </Button>
                        </div>
                      ))}
                      <p className="text-xs text-slate-400">{t("После добавления нажмите «Сохранить».")}</p>
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
