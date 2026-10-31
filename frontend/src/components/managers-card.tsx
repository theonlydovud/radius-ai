"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Manager } from "@/types";

const API = "/api/managers";

/** Список менеджеров для очереди заявок: добавить, переименовать, отключить. */
export function ManagersCard() {
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setManagers(json.data ?? []);
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить менеджеров.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: string, body: Record<string, unknown>) {
    const res = await fetch(API, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    setError(res.ok ? "" : json.error ?? "Не удалось сохранить.");
    setDrafts((prev) => {
      const { [id]: _saved, ...rest } = prev;
      return rest;
    });
    await load();
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => ({}));
    setError(res.ok ? "" : json.error ?? "Не удалось добавить.");
    if (res.ok) setNewName("");
    setAdding(false);
    await load();
  }

  const noneActive = managers !== null && !managers.some((m) => m.is_active);

  return (
    <Card className="mt-4 max-w-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Users className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <CardTitle>Менеджеры</CardTitle>
          <p className="text-xs text-slate-400">Новые заявки назначаются включённым менеджерам по очереди.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {managers === null ? (
          !error && <p className="text-sm text-slate-400">Загрузка...</p>
        ) : (
          <ul className="space-y-2">
            {managers.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Input
                  value={drafts[m.id] ?? m.name}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onBlur={() => {
                    const draft = drafts[m.id];
                    if (draft !== undefined && draft.trim() !== m.name) update(m.id, { name: draft });
                  }}
                  aria-label="Имя менеджера"
                />
                <Switch
                  checked={m.is_active}
                  onCheckedChange={(checked) => update(m.id, { is_active: checked })}
                  aria-label={`Заявки для ${m.name}`}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Имя нового менеджера"
          />
          <Button variant="outline" size="sm" onClick={add} disabled={adding || !newName.trim()}>
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </Button>
        </div>

        <p className="text-xs text-slate-400">
          Выключенный менеджер не получает новых заявок. Его старые заявки и статистика остаются.
        </p>
        {noneActive && <p className="text-xs text-amber-600">Все менеджеры выключены — новые заявки будут без ответственного.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
