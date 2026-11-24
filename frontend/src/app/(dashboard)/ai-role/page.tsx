"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AccountPicker, useSelectedBot } from "@/components/bot-selector";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Подсказка для пустого поля: что обычно пишут в роль. */
const EXAMPLE = () =>
  t(`Ты — менеджер компании «…». Отвечай коротко, дружелюбно, на языке клиента.

О компании: чем занимаемся, адрес, график работы.

Товары / услуги и цены:
- …
- …

Доставка и оплата: …

Что узнать у клиента: что нужно, когда, номер телефона.

Чего не делать: не обещай скидки, которых нет; если не знаешь ответа — скажи, что уточнит менеджер.`);

/**
 * «Роль ИИ» — один большой текст: кто бот, как общается, что знает о компании.
 * Заменяет «Знания ИИ» и «Правила общения». Пока роль не сохранена, бот работает по старым
 * правилам и знаниям — из них и собран черновик.
 */
export default function AiRolePage() {
  const { botId, ready } = useSelectedBot();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [fromDraft, setFromDraft] = useState(false);
  const [max, setMax] = useState(40_000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!botId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    fetch(`/api/ai-role?bot_id=${botId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.data) throw new Error(j.error);
        setSaved(j.data.prompt);
        setText(j.data.prompt || j.data.draft || "");
        setFromDraft(!j.data.prompt && Boolean(j.data.draft));
        setMax(j.data.max ?? 40_000);
      })
      .catch((e) => !cancelled && setNotice({ ok: false, text: e?.message || t("Не удалось загрузить.") }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [botId, ready]);

  async function save() {
    if (!botId) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai-role", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bot_id: botId, prompt: text }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? t("Не удалось сохранить."));
      setSaved(j.data.prompt);
      setFromDraft(false);
      setNotice({ ok: true, text: t("Сохранено — бот уже отвечает по новой роли") });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.message ?? t("Не удалось сохранить.") });
    } finally {
      setSaving(false);
    }
  }

  const dirty = text.trim() !== saved.trim();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t("Роль ИИ")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("Один текст: кто ваш бот, как он общается и что знает о компании — товары, цены, доставка, ответы на частые вопросы.")}
          </p>
        </div>
        <AccountPicker />
      </div>

      {!ready || loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Загрузка...")}
        </p>
      ) : !botId ? (
        <Card className="p-8 text-center text-sm text-slate-500">{t("Сначала подключите Instagram в «Настройках» — роль задаётся для аккаунта.")}</Card>
      ) : (
        <Card className="max-w-4xl p-4 sm:p-5">
          {fromDraft && (
            <p className="mb-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("Мы собрали черновик из ваших прежних правил и знаний. Сейчас бот работает по ним — проверьте текст и нажмите «Сохранить», чтобы перейти на роль.")}
            </p>
          )}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE()}
            maxLength={max}
            className="min-h-[60vh] font-mono text-[13px] leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={save} disabled={saving || (!dirty && !fromDraft)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t("Сохранить")}
            </Button>
            <span className={cn("text-xs tabular-nums", text.length > max * 0.9 ? "text-amber-600" : "text-slate-400")}>
              {text.length.toLocaleString("ru-RU")} / {max.toLocaleString("ru-RU")}
            </span>
            {notice && <span className={cn("text-sm", notice.ok ? "text-emerald-600" : "text-red-600")}>{notice.text}</span>}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {t("Язык ответа, имя компании и сбор заявок бот добавляет сам. Проверить, как он отвечает, можно в «Диалоге с ИИ».")}
          </p>
        </Card>
      )}
    </div>
  );
}
