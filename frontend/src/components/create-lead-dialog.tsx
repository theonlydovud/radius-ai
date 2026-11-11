"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useCurrentUser } from "@/components/current-user";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const AUTO = "auto";
const NONE = "none";

const EMPTY = { client_name: "", client_phone: "", origin_city: "", destination_city: "", weight: "", cargo_type: "", note: "" };

/**
 * Кнопка «Новая заявка» и форма. Менеджер создаёт заявку себе (сразу «В работе»),
 * руководитель и супер-админ выбирают ответственного: по очереди, конкретного или никого.
 */
export function CreateLeadButton({ onCreated, className }: { onCreated: () => void; className?: string }) {
  const { user, managers } = useCurrentUser();
  const canAssign = user.role !== "manager";
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
        body: JSON.stringify({ ...form, manager_id: canAssign ? (assignee === NONE ? null : assignee) : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Не удалось создать заявку.");
        return;
      }
      setOpen(false);
      setForm(EMPTY);
      setAssignee(AUTO);
      onCreated();
    } catch {
      setError("Не удалось создать заявку. Проверьте соединение.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className={className}>
        <Plus className="h-3.5 w-3.5" />
        Новая заявка
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setError("");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая заявка</DialogTitle>
            <DialogDescription>
              {canAssign ? "Клиент обратился напрямую — заведите заявку и назначьте менеджера." : "Клиент обратился напрямую — заявка будет ваша и сразу «В работе»."}
            </DialogDescription>
          </DialogHeader>

          <form id="create-lead" onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cl-name">Клиент *</Label>
                <Input id="cl-name" value={form.client_name} onChange={set("client_name")} placeholder="Имя или компания" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-phone">Телефон *</Label>
                <Input id="cl-phone" value={form.client_phone} onChange={set("client_phone")} placeholder="+998 90 123 45 67" inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-from">Откуда</Label>
                <Input id="cl-from" value={form.origin_city} onChange={set("origin_city")} placeholder="Китай" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-to">Куда</Label>
                <Input id="cl-to" value={form.destination_city} onChange={set("destination_city")} placeholder="Ташкент" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-weight">Вес / объём</Label>
                <Input id="cl-weight" value={form.weight} onChange={set("weight")} placeholder="5 т" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-cargo">Груз</Label>
                <Input id="cl-cargo" value={form.cargo_type} onChange={set("cargo_type")} placeholder="Мебель" />
              </div>
            </div>

            {canAssign && (
              <div className="space-y-1.5">
                <Label>Ответственный</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>По очереди (следующий менеджер)</SelectItem>
                    {managers
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    <SelectItem value={NONE}>Без ответственного</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cl-note">Комментарий</Label>
              <Textarea id="cl-note" value={form.note} onChange={set("note")} className="min-h-[64px]" placeholder="Откуда клиент, что важно знать" />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" type="submit" form="create-lead" disabled={saving || !form.client_name.trim() || !form.client_phone.trim()}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Создать заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
