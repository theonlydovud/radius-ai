"use client";

import { useEffect, useState } from "react";
import { KeyRound, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";

export function McpConnectorCard() {
  const [mcp, setMcp] = useState<{ endpoint: string; key_preview: string | null; enabled: boolean } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const res = await fetch("/api/settings/company", { cache: "no-store" });
    const json = await res.json();
    if (json.data?.mcp) setMcp(json.data.mcp);
  }

  useEffect(() => { void load(); }, []);

  async function action(action: "generate" | "revoke") {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcp_action: action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMcp(json.data?.mcp ?? null);
      setKey(json.data?.mcp?.key ?? "");
      setNotice(action === "generate" ? t("Ключ создан. Сохраните его сейчас — повторно посмотреть не получится.") : t("Ключ отозван."));
    } catch (e: any) {
      setNotice(e?.message || t("Не удалось изменить MCP-подключение."));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice(t("Скопировано."));
  }

  return (
    <Card className="mb-6 max-w-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
          <KeyRound className="h-4 w-4 text-brand" />
        </div>
        <div>
          <CardTitle>{t("Claude и MCP-коннектор")}</CardTitle>
          <p className="text-xs text-slate-400">{t("Claude сможет управлять вашей платформой: заявки, переписки, знания и роль ИИ.")}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">{t("Адрес MCP-сервера")}</p>
          <div className="flex gap-2">
            <Input readOnly value={mcp?.endpoint ?? ""} className="font-mono text-xs" />
            {mcp?.endpoint && (
              <Button type="button" variant="outline" size="sm" onClick={() => void copy(mcp.endpoint)} aria-label={t("Скопировать")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {key && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-medium text-amber-800">{t("Bearer API-ключ")}</p>
            <div className="flex gap-2">
              <Input readOnly value={key} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" onClick={() => void copy(key)} aria-label={t("Скопировать ключ")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-medium text-slate-800">{t("Как подключить Claude")}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>{t("Создайте ключ кнопкой ниже.")}</li>
            <li>{t("Откройте Claude → Settings → Connectors и добавьте custom connector.")}</li>
            <li>{t("Укажите адрес MCP-сервера из поля выше.")}</li>
            <li>{t("В поле Authorization выберите Bearer и вставьте сгенерированный API-ключ.")}</li>
            <li>{t("Включите коннектор и попросите Claude прочитать заявки, роли ИИ или изменить базу знаний.")}</li>
          </ol>
        </div>

        {notice && <p className="text-xs text-slate-600">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void action("generate")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            {mcp?.enabled ? t("Создать новый ключ") : t("Создать ключ")}
          </Button>
          {mcp?.enabled && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void action("revoke")}>{t("Отозвать ключ")}</Button>
          )}
          <a href="https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 text-xs text-brand hover:underline">
            {t("Справка Claude")}<ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
