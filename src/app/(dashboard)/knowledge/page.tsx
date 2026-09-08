"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDate } from "@/lib/utils";
import type { KnowledgeItem } from "@/types";

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Диалог создания/редактирования статьи. editingId === null → создание.
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Диалог подтверждения удаления.
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/knowledge");
    const data = await res.json();
    setItems(data.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreateDialog() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setOpen(true);
  }

  function openEditDialog(item: KnowledgeItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setContent(item.content);
    setOpen(true);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);

    if (editingId) {
      // Меняем текст статьи — эмбеддинг для RAG-поиска пересчитывается на
      // лету при следующем запросе клиента (см. src/lib/gemini.ts), отдельно
      // пересчитывать его здесь не нужно.
      await fetch("/api/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title, content }),
      });
    } else {
      await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
    }

    setSaving(false);
    setOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/knowledge?id=${deleteTarget.id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Знания ИИ</h1>
          <p className="mt-1 text-sm text-slate-500">
            Статьи, направления и регламенты доставки, которые ИИ использует как источник фактов (RAG).
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" />
              Добавить статью
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Редактировать статью" : "Новая статья базы знаний"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Заголовок</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Доставка из Ташкента в Москву"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Содержание</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Опишите регламент, сроки, тарифные пояснения..."
                  rows={6}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !content.trim()}>
                {saving ? "Сохранение..." : editingId ? "Сохранить изменения" : "Сохранить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка...</p>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <BookOpen className="h-6 w-6 text-slate-300" />
          <p className="text-sm text-slate-500">
            База знаний пока пуста. Добавьте первую статью, чтобы ИИ мог отвечать точнее.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <CardTitle className="pr-4">{item.title}</CardTitle>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => openEditDialog(item)}
                    className="text-slate-300 hover:text-slate-600"
                    title="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="text-slate-300 hover:text-red-500"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-4 text-sm text-slate-600">{item.content}</p>
                <p className="mt-3 text-xs text-slate-400">
                  Добавлено {formatDate(item.created_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить статью?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Статья «{deleteTarget?.title}» будет удалена безвозвратно и перестанет учитываться в RAG-поиске.
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
