"use client";

import { useEffect, useState } from "react";
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

function webhookUrlFor(platform: Platform, accountId: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/webhooks/${platform}/${accountId}`;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Состояние формы модального окна.
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [accountName, setAccountName] = useState("");
  const [token, setToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  // Состояние карточек: проверка соединения / копирование URL.
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setPlatform("instagram");
    setAccountName("");
    setToken("");
    setVerifyToken("");
    setShowToken(false);
  }

  async function handleConnect() {
    if (!accountName.trim() || !token.trim()) return;
    setSaving(true);
    // Токен сохраняется напрямую в таблицу accounts в Supabase через наш
    // серверный API-роут (используется service-role ключ на сервере) —
    // никаких .env-переменных для конкретного аккаунта не заводится.
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        account_name: accountName,
        access_token: token,
        webhook_verify_token: platform === "instagram" ? verifyToken || null : null,
      }),
    });
    resetForm();
    setSaving(false);
    setOpen(false);
    load();
  }

  async function handleDisconnect(id: string) {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
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
      <div className="mb-6 flex items-start justify-between">
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
                    <SelectItem value="telegram">Telegram Bot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Название аккаунта</Label>
                <Input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={platform === "telegram" ? "Radius Logistics Bot" : "@radius.logistics"}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{platform === "telegram" ? "Bot Token" : "Access Token (Page Access Token)"}</Label>
                <div className="relative">
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    type={showToken ? "text" : "password"}
                    placeholder={
                      platform === "telegram"
                        ? "123456:AAExampleTelegramBotToken"
                        : "EAAExampleInstagramPageAccessToken"
                    }
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

              {platform === "instagram" && (
                <div className="space-y-1.5">
                  <Label>Webhook Verify Token</Label>
                  <Input
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    placeholder="Произвольная строка — укажите её же в Meta for Developers"
                  />
                  <p className="text-xs text-slate-400">
                    Meta запросит этот токен при верификации вебхука (параметр hub.verify_token). Сам
                    URL вебхука появится в карточке аккаунта после сохранения — его можно будет
                    скопировать одной кнопкой.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleConnect} disabled={saving || !accountName.trim() || !token.trim()}>
                {saving ? "Подключение..." : "Подключить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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

            return (
              <Card key={acc.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                      {acc.platform === "telegram" ? (
                        <TelegramIcon className="h-4 w-4 text-slate-600" />
                      ) : (
                        <Instagram className="h-4 w-4 text-slate-600" />
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
                    onClick={() => handleDisconnect(acc.id)}
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
