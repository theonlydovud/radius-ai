"use client";

import { useEffect, useState, useRef } from "react";
import {
  Plus,
  Instagram,
  Send as TelegramIcon,
  Trash2,
  Plug,
  Eye,
  EyeOff,
  Link2,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Bot,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { AccountPublic, Platform } from "@/types";
import { InstagramSetup } from "@/components/instagram-setup";

function webhookUrlFor(platform: Platform, accountId: string) {
  // Вебхуки принимает backend (Render) напрямую, минуя Vercel-прокси.
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "") ||
    (typeof window === "undefined" ? "" : window.location.origin);
  if (!base) return "";
  // Instagram: один общий вебхук на приложение Meta, аккаунт определяется по ID.
  if (platform === "instagram") return `${base}/api/webhooks/instagram`;
  return `${base}/api/webhooks/${platform}/${accountId}`;
}

const OWN_KNOWLEDGE = "__own__";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Состояние формы модального окна.
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [accountName, setAccountName] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [telegramMode, setTelegramMode] = useState<"bot" | "user">("bot");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [telegramAuthMessage, setTelegramAuthMessage] = useState("");
  const [telegramAuthBusy, setTelegramAuthBusy] = useState(false);
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [telegramSessionString, setTelegramSessionString] = useState("");
  const [igMode, setIgMode] = useState<"login" | "token">("login");
  const [knowledgeSourceId, setKnowledgeSourceId] = useState(OWN_KNOWLEDGE);
  const [formError, setFormError] = useState("");
  // Результат входа через Instagram (backend возвращает на /accounts?ig=…).
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  // Готов ли backend к входу через Instagram (переменные заданы).
  const [igReady, setIgReady] = useState(false);

  // Состояние карточек: проверка соединения / копирование URL.
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const telegramAuthLockRef = useRef(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/accounts", { cache: "no-store" });
    const data = await res.json();
    setAccounts(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // Слушатели поднимаются на сервере сами — кнопок/вызовов не нужно.
    load();

    const params = new URLSearchParams(window.location.search);
    const ig = params.get("ig");
    const igError = params.get("ig_error");
    if (ig || igError) {
      setBanner(
        igError
          ? { ok: false, text: `Instagram не подключён: ${igError}` }
          : { ok: true, text: `Instagram @${params.get("name") ?? ""} ${ig === "reconnected" ? "переподключён" : "подключён"}.` }
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Агенты — аккаунты со своими знаниями; к ним можно подключать другие аккаунты.
  const agents = accounts.filter((a) => !a.knowledge_source_id);
  const sourceForApi = knowledgeSourceId === OWN_KNOWLEDGE ? null : knowledgeSourceId;

  function resetForm() {
    setPlatform("instagram");
    setAccountName("");
    setToken("");
    setShowToken(false);
    setTelegramMode("bot");
    setApiId("");
    setApiHash("");
    setPhoneNumber("");
    setPhoneCode("");
    setPassword("");
    setCodeSent(false);
    setTelegramAuthMessage("");
    setTelegramAuthBusy(false);
    setPhoneCodeHash("");
    setTelegramSessionString("");
    setIgMode("login");
    setKnowledgeSourceId(OWN_KNOWLEDGE);
    setFormError("");
    telegramAuthLockRef.current = false;
  }

  async function handleConnect() {
    if (telegramAuthLockRef.current) return;
    if (telegramAuthBusy) return;
    setFormError("");

    if (platform === "instagram" && igMode === "login") {
      // Уходим на окно входа Instagram; backend вернёт обратно на /accounts.
      const qs = sourceForApi ? `?knowledge_source_id=${encodeURIComponent(sourceForApi)}` : "";
      window.location.href = `/api/auth/instagram${qs}`;
      return;
    }

    if (platform === "telegram" && telegramMode === "user") {
      if (!codeSent) {
        if (!accountName.trim() || !apiId.trim() || !apiHash.trim() || !phoneNumber.trim()) return;

        telegramAuthLockRef.current = true;
        setTelegramAuthBusy(true);
        try {
          const res = await fetch("/api/telegram/auth/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone_number: phoneNumber,
              api_id: Number(apiId),
              api_hash: apiHash,
            }),
          });
          const data = await res.json();
          setTelegramAuthMessage(data.message ?? "");

          if (!data.ok) return;

          setPhoneCodeHash(data.phoneCodeHash ?? "");
          setTelegramSessionString(data.sessionString ?? "");
          setCodeSent(true);
        } finally {
          telegramAuthLockRef.current = false;
          setTelegramAuthBusy(false);
        }
        return;
      }

      if (!phoneCode.trim()) return;
      telegramAuthLockRef.current = true;
      setTelegramAuthBusy(true);
      try {
        const res = await fetch("/api/telegram/auth/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone_number: phoneNumber,
            api_id: Number(apiId),
            api_hash: apiHash,
            phone_code: phoneCode,
            password: password || undefined,
            phone_code_hash: phoneCodeHash || undefined,
            session_string: telegramSessionString || undefined,
          }),
        });
        const data = await res.json();
        setTelegramAuthMessage(data.message ?? "");

        if (!data.ok || !data.sessionString) return;

        const saveRes = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "telegram",
            account_name: accountName,
            access_token: data.sessionString,
            auth_type: "user",
            api_id: Number(apiId),
            api_hash: apiHash,
            phone_number: phoneNumber,
            knowledge_source_id: sourceForApi,
          }),
        });

        const saved = await saveRes.json();
        if (!saveRes.ok) {
          setTelegramAuthMessage(saved.error ?? "Не удалось сохранить Telegram-аккаунт.");
          return;
        }

        // Слушатель нового аккаунта стартует на сервере в POST /api/accounts.
        resetForm();
        setOpen(false);
        load();
      } finally {
        telegramAuthLockRef.current = false;
        setTelegramAuthBusy(false);
      }
      return;
    }

    if ((!accountName.trim() && platform !== "instagram") || !token.trim()) return;
    setSaving(true);
    // Токен сохраняется напрямую в таблицу accounts в Supabase через наш
    // серверный API-роут (используется service-role ключ на сервере) —
    // никаких .env-переменных для конкретного аккаунта не заводится.
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        account_name: accountName,
        access_token: token,
        knowledge_source_id: sourceForApi,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error ?? "Не удалось подключить аккаунт.");
      setSaving(false);
      return;
    }
    resetForm();
    setSaving(false);
    setOpen(false);
    load();
  }

  async function handleChangeSource(acc: AccountPublic, value: string) {
    const res = await fetch("/api/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: acc.id, knowledge_source_id: value === OWN_KNOWLEDGE ? null : value }),
    });
    const data = await res.json().catch(() => ({}));
    setTestResult((prev) => ({
      ...prev,
      [acc.id]: res.ok
        ? { ok: true, message: "Источник знаний обновлён." }
        : { ok: false, message: data.error ?? "Не удалось сохранить." },
    }));
    load();
  }

  async function handleDisconnect(acc: AccountPublic) {
    // В БД у чатов и заявок ON DELETE CASCADE: удаление аккаунта стирает их безвозвратно.
    const confirmed = window.confirm(
      `Удалить аккаунт «${acc.account_name}»?\n\nВместе с ним навсегда удалятся все его чаты и заявки, в том числе из статистики.`
    );
    if (!confirmed) return;
    setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
    await fetch(`/api/accounts?id=${acc.id}`, { method: "DELETE" });
  }

  async function handleTestConnection(acc: AccountPublic) {
    setTestingId(acc.id);
    setTestResult((prev) => ({ ...prev, [acc.id]: undefined as any }));
    try {
      const res = await fetch(`/api/accounts/${acc.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [acc.id]: { ok: data.ok, message: data.message } }));
      load();
    } catch {
      setTestResult((prev) => ({
        ...prev,
        [acc.id]: { ok: false, message: "Не удалось выполнить проверку." },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleCopyWebhook(acc: AccountPublic) {
    const url = webhookUrlFor(acc.platform, acc.id);
    await navigator.clipboard.writeText(url);
    setCopiedId(acc.id);
    setTimeout(() => setCopiedId((id) => (id === acc.id ? null : id)), 2000);
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Аккаунты</h1>
          <p className="mt-1 text-sm text-slate-500">
            Подключённые аккаунты Instagram Direct и Telegram. Токены хранятся только в Supabase —
            каждый аккаунт независим и не требует деплоя для смены токена.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Подключить аккаунт
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Подключить аккаунт</DialogTitle>
              <DialogDescription>
                Данные сохраняются напрямую в таблицу accounts в Supabase.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Платформа</Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram Direct</SelectItem>
                    <SelectItem value="telegram">Telegram (бот или личный аккаунт)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {agents.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Знания и правила</Label>
                  <Select value={knowledgeSourceId} onValueChange={setKnowledgeSourceId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OWN_KNOWLEDGE}>Новый агент — свои знания и правила</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          Как у {a.account_name} ({a.platform === "telegram" ? "Telegram" : "Instagram"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400">
                    Подключите к существующему агенту, чтобы бот отвечал по тем же знаниям без их дублирования.
                  </p>
                </div>
              )}

              {platform === "instagram" && (
                <div className="space-y-1.5">
                  <Label>Способ подключения</Label>
                  <Select value={igMode} onValueChange={(v) => setIgMode(v as "login" | "token")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="login">Войти через Instagram (рекомендуется)</SelectItem>
                      <SelectItem value="token">Вставить Access Token вручную</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {platform === "instagram" && igMode === "login" && (
                <InstagramSetup onReady={setIgReady} />
              )}

              {!(platform === "instagram" && igMode === "login") && (
                <div className="space-y-1.5">
                  <Label>Название аккаунта{platform === "instagram" ? " (необязательно)" : ""}</Label>
                  <Input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder={platform === "telegram" ? "Radius Logistics Bot" : "По умолчанию — @username из Instagram"}
                  />
                </div>
              )}

              {platform === "instagram" && igMode === "token" && (
                <div className="space-y-1.5">
                  <Label>Access Token</Label>
                  <div className="relative">
                    <Input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      type={showToken ? "text" : "password"}
                      placeholder="IGAA… (Instagram Login) или EAA… (Page Access Token)"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Meta for Developers → приложение → Instagram → API setup with Instagram login →
                    Generate token. Подписка на вебхук оформится автоматически.
                  </p>
                </div>
              )}

              {platform === "telegram" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Режим подключения</Label>
                    <Select value={telegramMode} onValueChange={(v) => setTelegramMode(v as "bot" | "user")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bot">Bot (по токену)</SelectItem>
                        <SelectItem value="user">Личный аккаунт (номер → код → 2FA)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {telegramMode === "bot" ? (
                    <div className="space-y-1.5">
                      <Label>Bot Token</Label>
                      <div className="relative">
                        <Input
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          type={showToken ? "text" : "password"}
                          placeholder="123456:AAExampleTelegramBotToken"
                          className="pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>API ID</Label>
                        <Input value={apiId} onChange={(e) => setApiId(e.target.value)} placeholder="Ваш API ID" />
                      </div>

                      <div className="space-y-1.5">
                        <Label>API Hash</Label>
                        <Input value={apiHash} onChange={(e) => setApiHash(e.target.value)} placeholder="Ваш API Hash" />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Номер телефона</Label>
                        <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+14155552671" />
                      </div>

                      {codeSent && (
                        <div className="space-y-1.5">
                          <Label>Код из Telegram</Label>
                          <Input value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="12345" />
                        </div>
                      )}

                      {codeSent && (
                        <div className="space-y-1.5">
                          <Label>Пароль 2FA (если включён)</Label>
                          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Необязательно" />
                        </div>
                      )}

                      {!codeSent && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (telegramAuthLockRef.current || telegramAuthBusy) return;
                            if (!accountName.trim() || !apiId.trim() || !apiHash.trim() || !phoneNumber.trim()) return;
                            telegramAuthLockRef.current = true;
                            setTelegramAuthBusy(true);
                            setTelegramAuthMessage("");
                            try {
                              const res = await fetch("/api/telegram/auth/start", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  phone_number: phoneNumber,
                                  api_id: Number(apiId),
                                  api_hash: apiHash,
                                }),
                              });
                              const data = await res.json();
                              setCodeSent(data.ok);
                              setTelegramAuthMessage(data.message ?? "");
                              if (!data.ok) return;
                              setPhoneCodeHash(data.phoneCodeHash ?? "");
                              setTelegramSessionString(data.sessionString ?? "");
                              setCodeSent(true);
                            } finally {
                              telegramAuthLockRef.current = false;
                              setTelegramAuthBusy(false);
                            }
                          }}
                          disabled={telegramAuthBusy || telegramAuthLockRef.current || !accountName.trim() || !apiId.trim() || !apiHash.trim() || !phoneNumber.trim()}
                          className="w-full"
                        >
                          {telegramAuthBusy ? "Отправка..." : "Отправить код"}
                        </Button>
                      )}

                      {telegramAuthMessage && (
                        <p className="text-xs text-slate-500">{telegramAuthMessage}</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={
                  saving ||
                  telegramAuthBusy ||
                  (platform === "instagram" && igMode === "token" && !token.trim()) ||
                  (platform === "instagram" && igMode === "login" && !igReady) ||
                  (platform === "telegram" && !accountName.trim()) ||
                  (platform === "telegram" && telegramMode === "bot" && !token.trim()) ||
                  (platform === "telegram" && telegramMode === "user" && (!accountName.trim() || !apiId.trim() || !apiHash.trim() || !phoneNumber.trim() || !phoneCode.trim()))
                }
              >
                {platform === "instagram" && igMode === "login" ? <LogIn className="h-3.5 w-3.5" /> : null}
                {saving
                  ? "Подключение..."
                  : platform === "instagram" && igMode === "login"
                    ? "Войти через Instagram"
                    : platform === "telegram" && telegramMode === "user"
                      ? codeSent ? "Подтвердить" : "Подключить"
                      : "Подключить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {banner && (
        <div
          className={cn(
            "mb-4 rounded-lg border px-3 py-2 text-sm",
            banner.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          )}
        >
          {banner.text}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка...</p>
      ) : accounts.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <Plug className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">Пока нет подключённых аккаунтов.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accounts.map((acc) => {
            const webhookUrl = webhookUrlFor(acc.platform, acc.id);
            const result = testResult[acc.id];
            const dependents = accounts.filter((a) => a.knowledge_source_id === acc.id);

            return (
              <Card key={acc.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
                      {acc.platform === "telegram" ? (
                        <TelegramIcon className="h-4 w-4 text-brand" />
                      ) : (
                        <Instagram className="h-4 w-4 text-brand" />
                      )}
                    </div>
                    <div>
                      <CardTitle>{acc.account_name}</CardTitle>
                      <p className="text-xs text-slate-400">
                        {acc.platform === "telegram" ? "Telegram" : "Instagram Direct"} ·{" "}
                        {acc.access_token_preview}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(acc)}
                    className="text-slate-300 hover:text-red-500"
                    title="Отключить / удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant={acc.status === "connected" ? "success" : acc.status === "error" ? "danger" : "secondary"}>
                      <span
                        className={cn(
                          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                          acc.status === "connected" ? "bg-emerald-500" : acc.status === "error" ? "bg-red-500" : "bg-slate-400"
                        )}
                      />
                      {acc.status === "connected" ? "Connected / Active" : acc.status === "error" ? "Ошибка соединения" : "Отключён"}
                    </Badge>
                    <p className="text-xs text-slate-400">с {formatDate(acc.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {dependents.length > 0 ? (
                      <p className="text-xs text-slate-500">
                        Агент. Те же знания использует: {dependents.map((d) => d.account_name).join(", ")}
                      </p>
                    ) : (
                      <Select
                        value={acc.knowledge_source_id ?? OWN_KNOWLEDGE}
                        onValueChange={(v) => handleChangeSource(acc, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OWN_KNOWLEDGE}>Свои знания и правила</SelectItem>
                          {agents
                            .filter((a) => a.id !== acc.id)
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                Знания и правила как у {a.account_name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <p className="flex-1 truncate text-xs text-slate-500">{webhookUrl}</p>
                    <button
                      onClick={() => handleCopyWebhook(acc)}
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                      title="Скопировать Webhook URL"
                    >
                      {copiedId === acc.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {result && (
                    <p className={cn("text-xs", result.ok ? "text-emerald-600" : "text-red-600")}>
                      {result.message}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleTestConnection(acc)}
                      disabled={testingId === acc.id}
                    >
                      {testingId === acc.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Проверить соединение
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
