"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { RuleType, SystemRule } from "@/types";

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  tone: "Тон общения",
  qualification_requirements: "Квалификация лида",
  general: "Общее правило",
};

export default function RulesPage() {
  const [rules, setRules] = useState<SystemRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Диалог создания/редактирования правила. editingId === null → создание.
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [ruleText, setRuleText] = useState("");
  const [ruleType, setRuleType] = useState<RuleType>("general");
  const [saving, setSaving] = useState(false);

  // Диалог подтверждения удаления.
  const [deleteTarget, setDeleteTarget] = useState<SystemRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/rules");
    const data = await res.json();
    setRules(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreateDialog() {
    setEditingId(null);
    setTitle("");
    setRuleText("");
    setRuleType("general");
    setOpen(true);
  }

  function openEditDialog(rule: SystemRule) {
    setEditingId(rule.id);
    setTitle(rule.title);
    setRuleText(rule.rule_text);
    setRuleType(rule.rule_type);
    setOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !ruleText.trim()) return;
    setSaving(true);

    if (editingId) {
      await fetch("/api/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title, rule_text: ruleText }),
      });
    } else {
      await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, rule_text: ruleText, rule_type: ruleType }),
      });
    }

    setSaving(false);
    setOpen(false);
    load();
  }

  async function toggleActive(rule: SystemRule) {
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    );
    await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/rules?id=${deleteTarget.id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  }

  const grouped = (Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((type) => ({
    type,
    label: RULE_TYPE_LABELS[type],
    items: rules.filter((r) => r.rule_type === type),
  }));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Правила общения</h1>
          <p className="mt-1 text-sm text-slate-500">
            ИИ работает как консультант: не называет цены сам, а собирает данные для логиста —
            откуда, куда, вес/объём и телефон клиента.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              Новое правило
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Редактировать правило" : "Новое правило"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Тип правила</Label>
                <Select
                  value={ruleType}
                  onValueChange={(v) => setRuleType(v as RuleType)}
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {RULE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingId && (
                  <p className="text-xs text-slate-400">
                    Тип правила нельзя изменить — создайте новое правило, если нужен другой тип.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Всегда уточнять телефон"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Формулировка для ИИ</Label>
                <Textarea
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  placeholder="Опишите инструкцию простым языком..."
                  rows={5}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !ruleText.trim()}>
                {saving ? "Сохранение..." : editingId ? "Сохранить изменения" : "Сохранить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка...</p>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.type}>
              <h2 className="mb-3 text-sm font-medium text-slate-700">{group.label}</h2>
              {group.items.length === 0 ? (
                <Card className="flex items-center gap-2 p-5 text-sm text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-slate-300" />
                  Правил этого типа пока нет.
                </Card>
              ) : (
                <div className="space-y-3">
                  {group.items.map((rule) => (
                    <Card key={rule.id}>
                      <CardHeader className="flex-row items-start justify-between space-y-0">
                        <div className="pr-4">
                          <CardTitle>{rule.title}</CardTitle>
                          <CardDescription className="mt-1">{rule.rule_text}</CardDescription>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 pl-2">
                          <Badge variant={rule.is_active ? "success" : "secondary"}>
                            {rule.is_active ? "Активно" : "Отключено"}
                          </Badge>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={() => toggleActive(rule)}
                          />
                          <button
                            onClick={() => openEditDialog(rule)}
                            className="text-slate-300 hover:text-slate-600"
                            title="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(rule)}
                            className="text-slate-300 hover:text-red-500"
                            title="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить правило?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Правило «{deleteTarget?.title}» будет удалено безвозвратно и перестанет учитываться ИИ.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
