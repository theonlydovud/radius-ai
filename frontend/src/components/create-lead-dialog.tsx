"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useCurrentUser } from "@/components/current-user";
import { useAccountId } from "@/components/account-switcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/lib/i18n";

const AUTO = "auto";
const NONE = "none";

const EMPTY = { client_name: "", client_phone: "", origin_city: "", destination_city: "", weight: "", cargo_type: "", request: "", note: "" };

/**
 * Кнопка «Новая заявка» и форма. Менеджер создаёт заявку себе (сразу «В работе»),
 * руководитель и супер-админ выбирают ответственного: по очереди, конкретного или никого.
 */
export function CreateLeadButton({ onCreated, className }: { onCreated: () => void; className?: string }) {
  const { user, managers, company } = useCurrentUser();
  // Логистика (Radius) — маршрут, вес, груз; остальные компании — «что хочет клиент».
  const cargo = company.lead_kind === "cargo";
  const canAssign = user.role !== "manager";
  const accountId = useAccountId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [assignee, setAssignee] = useState(AUTO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, manager_id: canAssign ? (assignee === NONE ? null : assignee) : undefined, account_id: accountId ?? undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? t("Не удалось создать заявку."));
        return;
      }
      setOpen(false);
      setForm(EMPTY);
      setAssignee(AUTO);
      onCreated();
    } catch {
      setError(t("Не удалось создать заявку. Проверьте соединение."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className={className}>
        <Plus className="h-3.5 w-3.5" />
        {t("Новая заявка")}</Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setError("");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Новая заявка")}</DialogTitle>
            <DialogDescription>
              {canAssign ? t("Клиент обратился напрямую — заведите заявку и назначьте менеджера.") : t("Клиент обратился напрямую — заявка будет ваша и сразу «В работе».")}
            </DialogDescription>
          </DialogHeader>

          <form id="create-lead" onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cl-name">{t("Клиент *")}</Label>
                <Input id="cl-name" value={form.client_name} onChange={set("client_name")} placeholder={t("Имя или компания")} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-phone">{t("Телефон *")}</Label>
                <Input id="cl-phone" value={form.client_phone} onChange={set("client_phone")} placeholder="+998 90 123 45 67" inputMode="tel" />
              </div>
              {cargo ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-from">{t("Откуда")}</Label>
                    <Input id="cl-from" value={form.origin_city} onChange={set("origin_city")} placeholder={t("Китай")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-to">{t("Куда")}</Label>
                    <Input id="cl-to" value={form.destination_city} onChange={set("destination_city")} placeholder={t("Ташкент")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-weight">{t("Вес / объём")}</Label>
                    <Input id="cl-weight" value={form.weight} onChange={set("weight")} placeholder={t("5 т")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-cargo">{t("Груз")}</Label>
                    <Input id="cl-cargo" value={form.cargo_type} onChange={set("cargo_type")} placeholder={t("Мебель")} />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cl-request">{t("Что хочет клиент")}</Label>
                  <Input id="cl-request" value={form.request} onChange={set("request")} placeholder={t("Например, курс PRO или диван угловой")} />
                </div>
              )}
            </div>

            {canAssign && (
              <div className="space-y-1.5">
                <Label>{t("Ответственный")}</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>{t("По очереди (следующий менеджер)")}</SelectItem>
                    {managers
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    <SelectItem value={NONE}>{t("Без ответственного")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cl-note">{t("Комментарий")}</Label>
              <Textarea id="cl-note" value={form.note} onChange={set("note")} className="min-h-[64px]" placeholder={t("Откуда клиент, что важно знать")} />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t("Отмена")}</Button>
            <Button size="sm" type="submit" form="create-lead" disabled={saving || !form.client_name.trim() || !form.client_phone.trim()}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("Создать заявку")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
