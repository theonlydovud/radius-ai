"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DIRECTOR, useCurrentUser } from "@/components/current-user";
import { LOST_REASONS } from "@/lib/lead-meta";
import { cn } from "@/lib/utils";
import type { Lead, LostReason } from "@/types";

export type CloseMode = "sold" | "not_sold";

/** Закрытие заявки. «Кто закрывает» по умолчанию — пользователь, выбранный внизу бокового меню. */
export function CloseLeadDialog({
  lead,
  mode,
  onClose,
  onClosed,
}: {
  lead: Lead;
  mode: CloseMode;
  onClose: () => void;
  onClosed: () => void;
}) {
  const { user, managers } = useCurrentUser();
  const [closedBy, setClosedBy] = useState(user.name);
  const [reason, setReason] = useState<LostReason | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // В списке — директор, активные менеджеры и текущий выбор, даже если менеджера уже отключили.
  const names = [DIRECTOR.name, ...managers.filter((m) => m.is_active).map((m) => m.name)];
  if (closedBy && !names.includes(closedBy)) names.push(closedBy);

  const canSubmit = Boolean(closedBy) && (mode === "sold" || Boolean(reason)) && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "sold"
            ? { status: "sold", closed_by: closedBy }
            : { status: "not_sold", closed_by: closedBy, lost_reason: reason, lost_comment: comment }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Не удалось закрыть заявку.");
        return;
      }
      onClosed();
    } catch {
      setError("Не удалось закрыть заявку. Проверьте соединение.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "sold" ? "Продано" : "Не продано"}</DialogTitle>
          <DialogDescription>
            {lead.client_name} · {lead.collected_data?.origin_city ?? "—"} → {lead.collected_data?.destination_city ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Кто закрывает</Label>
            <Select value={closedBy || undefined} onValueChange={setClosedBy}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите менеджера" />
              </SelectTrigger>
              <SelectContent>
                {names.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "not_sold" && (
            <>
              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 text-xs font-medium text-slate-600">Причина</legend>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {LOST_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50",
                        reason === r.value && "border-brand bg-brand-soft"
                      )}
                    >
                      <input
                        type="radio"
                        name="lost-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="accent-brand"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <Label>Комментарий (необязательно)</Label>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-[64px]" />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit}>
            {saving ? "Сохранение..." : "Закрыть заявку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
