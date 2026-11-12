import { createAdminClient } from "../lib/supabase/server";
import { invalidateAuthCache, publicCompany } from "../lib/auth";
import { notifyDexaAdmins } from "../lib/dexa-bot";
import type { RouteContext } from "../index";

/**
 * Кабинет компании на пробном периоде и после его конца:
 *   GET  /api/cabinet           → компания, анкета, отправлена ли заявка на подключение
 *   PUT  /api/cabinet           { name, profile }  — анкета компании
 *   POST /api/cabinet/connect                       — «Подключить ИИ-менеджера» → уведомление владельцу DexaAI
 * Только своя компания: id берётся из входа, не из запроса.
 */

const PROFILE_FIELDS: Record<string, number> = {
  industry: 100,
  city: 60,
  contact_name: 100,
  phone: 40,
  instagram: 100,
  telegram: 100,
  website: 200,
  employees: 40,
  about: 2000,
};

function clean(v: unknown, max: number) {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
}

async function load(companyId: string) {
  const { data } = await createAdminClient().from("companies").select("*").eq("id", companyId).maybeSingle();
  return data;
}

function view(c: any) {
  const info = publicCompany(c);
  return {
    id: c.id,
    name: c.name,
    status: info.status,
    trial_ends_at: info.trial_ends_at,
    profile: c.profile ?? {},
    connect_requested_at: c.connect_requested_at ?? null,
  };
}

export const company = {
  async GET(_req: Request, ctx: RouteContext) {
    const c = await load(ctx.auth!.company.id);
    if (!c) return Response.json({ error: "Компания не найдена." }, { status: 404 });
    return Response.json({ data: view(c) });
  },

  async PUT(req: Request, ctx: RouteContext) {
    if (ctx.auth!.role !== "owner") return Response.json({ error: "Анкету заполняет владелец." }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const name = clean(body.name, 120);
    if (!name) return Response.json({ error: "Укажите название компании." }, { status: 400 });
    const profile: Record<string, string | null> = {};
    for (const [key, max] of Object.entries(PROFILE_FIELDS)) profile[key] = clean(body.profile?.[key], max);

    const { error } = await createAdminClient().from("companies").update({ name, profile }).eq("id", ctx.auth!.company.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    invalidateAuthCache();
    return Response.json({ data: view(await load(ctx.auth!.company.id)) });
  },
};

export const connect = {
  async POST(_req: Request, ctx: RouteContext) {
    const c = await load(ctx.auth!.company.id);
    if (!c) return Response.json({ error: "Компания не найдена." }, { status: 404 });
    if (!c.connect_requested_at) {
      await createAdminClient().from("companies").update({ connect_requested_at: new Date().toISOString() }).eq("id", c.id);
    }
    const p = c.profile ?? {};
    const line = (label: string, v: unknown) => (v ? `\n${label}: ${String(v).replace(/[<>&]/g, "")}` : "");
    const info = publicCompany(c);
    const trial = info.trial_ends_at
      ? `\nПробный период: ${info.status === "expired" ? "закончился" : "до"} ${info.trial_ends_at.slice(0, 10)}`
      : "";
    await notifyDexaAdmins(
      `💼 <b>Заявка на подключение</b>\nКомпания: <b>${String(c.name).replace(/[<>&]/g, "")}</b>${trial}` +
        line("Сфера", p.industry) +
        line("Город", p.city) +
        line("Контакт", p.contact_name) +
        line("Телефон", p.phone) +
        line("Telegram", p.telegram) +
        line("Instagram", p.instagram) +
        line("Сайт", p.website) +
        line("Сотрудников", p.employees) +
        line("О компании", p.about)
    );
    return Response.json({ data: view(await load(c.id)) });
  },
};
