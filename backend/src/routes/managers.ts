import { createAdminClient } from "../lib/supabase/server";
import type { RouteContext } from "../index";
import type { AuthCompany } from "../lib/auth";

/**
 * Менеджеры, редактируются в «Настройках». Удаления нет намеренно: отключённый
 * менеджер (is_active = false) не получает новых заявок, но его заявки и
 * статистика остаются.
 */

/**
 * Пользователи по тарифу: владелец + активные менеджеры ≤ включено в тариф + докупленные.
 * exceptId — менеджер, которого включают обратно (он уже может быть активен).
 */
async function usersLimitError(supabase: any, company: AuthCompany, exceptId: string | null): Promise<string | null> {
  const limit = company.usage.users_limit;
  if (limit === null) return null;
  let q = supabase.from("managers").select("id").eq("company_id", company.id).eq("is_active", true);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q;
  if ((data?.length ?? 0) + 1 < limit) return null;
  return `На тарифе ${company.plan?.name} — ${limit} ${limit === 1 ? "пользователь" : "пользователей"} (вместе с вами). Чтобы добавить ещё, докупите пользователя или перейдите на тариф выше.`;
}

function nameError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return error.message.includes("telegram") ? "Этот Telegram ID уже указан у другого менеджера." : "Такой менеджер уже есть.";
  }
  return error.message;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("managers")
    .select("id, name, is_active, sort_order, telegram_id")
    .eq("company_id", ctx.auth!.company.id)
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const company = ctx.auth!.company.id;
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Укажите имя менеджера." }, { status: 400 });

  // Новый менеджер встаёт в конец очереди.
  const { data: last } = await supabase
    .from("managers")
    .select("sort_order")
    .eq("company_id", company)
    .order("sort_order", { ascending: false })
    .limit(1);

  const limitError = await usersLimitError(supabase, ctx.auth!.company, null);
  if (limitError) return Response.json({ error: limitError, code: "users_limit" }, { status: 403 });

  const { data, error } = await supabase
    .from("managers")
    .insert({ name, company_id: company, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
    .select("id, name, is_active, sort_order, telegram_id")
    .single();

  if (error) return Response.json({ error: nameError(error) }, { status: 400 });
  return Response.json({ data });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.id) return Response.json({ error: "id обязателен." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return Response.json({ error: "Укажите имя менеджера." }, { status: 400 });
    updates.name = name;
  }
  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
    if (updates.is_active) {
      const limitError = await usersLimitError(supabase, ctx.auth!.company, String(body.id));
      if (limitError) return Response.json({ error: limitError, code: "users_limit" }, { status: 403 });
    }
  }
  if (body.telegram_id !== undefined) {
    const raw = String(body.telegram_id ?? "").trim();
    if (raw && !/^\d{5,15}$/.test(raw)) return Response.json({ error: "Telegram ID — это число, например 7060366480." }, { status: 400 });
    updates.telegram_id = raw ? Number(raw) : null;
  }
  if (Object.keys(updates).length === 0) return Response.json({ error: "Нечего менять." }, { status: 400 });

  const { data, error } = await supabase
    .from("managers")
    .update(updates)
    .eq("id", body.id)
    .eq("company_id", ctx.auth!.company.id)
    .select("id, name, is_active, sort_order, telegram_id")
    .maybeSingle();

  if (error) return Response.json({ error: nameError(error) }, { status: 400 });
  if (!data) return Response.json({ error: "Менеджер не найден." }, { status: 404 });
  return Response.json({ data });
}
