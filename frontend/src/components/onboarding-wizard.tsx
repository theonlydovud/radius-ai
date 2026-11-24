"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUser } from "@/components/current-user";
import { saveCompanySettings } from "@/components/funnel-settings-card";
import { TEMPLATE_CHOICES, type Template } from "@/lib/lead-meta";
import { t } from "@/lib/i18n";

const dismissKey = (companyId: string) => `dexa_wizard_skip_${companyId}`;

/**
 * Мастер «Кто вы?»: руководителю кабинета, где шаблон бизнеса ещё не выбран.
 * Шаблон заполняет этапы, причины отказа и термины; всё меняется потом в «Настройках».
 * «Пропустить» — стандартная воронка, мастер больше не показывается на этом устройстве.
 */
export function OnboardingWizard() {
  const { user, company, updateSettings } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Template | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = company.settings;
    // Старый backend (нет воронки), шаблон уже выбран, не руководитель или владелец платформы — не показываем.
    if (!s?.stages || s.template || user.role !== "owner" || user.platform) return setOpen(false);
    let skipped = false;
    try {
      skipped = window.localStorage.getItem(dismissKey(company.id)) === "1";
    } catch {
      /* без localStorage — просто покажем */
    }
    setOpen(!skipped);
  }, [company.id, company.settings, user.role, user.platform]);

  function skip() {
    try {
      window.localStorage.setItem(dismissKey(company.id), "1");
    } catch {
      /* ничего */
    }
    setOpen(false);
  }

  async function choose(template: Template) {
    setBusy(template);
    setError("");
    try {
      updateSettings(await saveCompanySettings({ template }));
      setOpen(false);
    } catch (e: any) {
      setError(e?.message ?? t("Не удалось сохранить."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && skip()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Кто вы?")}</DialogTitle>
          <DialogDescription>{t("Выберите, чем вы занимаетесь — подставим этапы заявок, причины отказа и термины. Всё можно поменять в «Настройках».")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TEMPLATE_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={busy !== null}
              onClick={() => choose(c.value)}
              className="rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-60"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {c.title}
                {busy === c.value && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{c.hint}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">{c.stages.join(" → ")}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={skip} disabled={busy !== null} className="mx-auto text-xs text-slate-400 hover:text-slate-600">
          {t("Пропустить")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
