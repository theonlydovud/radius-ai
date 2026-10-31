"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LOST_REASONS } from "@/lib/lead-meta";
import { cn } from "@/lib/utils";
import type { Lead, LostReason, Manager } from "@/types";

const LAST_CLOSER_KEY = "radius.lastCloser";

export type CloseMode = "sold" | "not_sold";

/**
 * Закрытие заявки. Входа в дашборд нет, поэтому «кто закрывает» выбирают здесь:
 * по умолчанию ответственный, иначе тот, кто закрывал в этом браузере в прошлый раз.
 */
export function CloseLeadDialog({
  lead,
  mode,
  managers,
  onClose,
  onClosed,
}: {
  lead: Lead;
  mode: CloseMode;
  managers: Manager[];
  onClose: () => void;
  onClosed: () => void;
}) {
  const [closedBy, setClosedBy] = useState("");
  const [reason, setReason] = useState<LostReason | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let remembered = "";
    try {
      remembered = window.localStorage.getItem(LAST_CLOSER_KEY) ?? "";
    } catch {
      /* private mode */
    }
    setClosedBy(lead.manager?.name ?? remembered);
  }, [lead]);

  // В списке — активные менеджеры и текущий выбор, даже если менеджера уже отключили.
  const names = managers.filter((m) => m.is_active).map((m) => m.name);
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
      try {
        window.localStorage.setItem(LAST_CLOSER_KEY, closedBy);
      } catch {
        /* private mode */
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
                        reason === r.value && "border-slate-900 bg-slate-50"
                      )}
                    >
                      <input
                        type="radio"
                        name="lost-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="accent-slate-900"
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
