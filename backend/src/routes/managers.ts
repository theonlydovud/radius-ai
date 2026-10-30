import { createAdminClient } from "../lib/supabase/server";

/**
 * Менеджеры, редактируются в «Настройках». Удаления нет намеренно: отключённый
 * менеджер (is_active = false) не получает новых заявок, но его заявки и
 * статистика остаются.
 */

function nameError(error: { code?: string; message: string }) {
  return error.code === "23505" ? "Такой менеджер уже есть." : error.message;
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("managers")
    .select("id, name, is_active, sort_order")
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Укажите имя менеджера." }, { status: 400 });

  // Новый менеджер встаёт в конец очереди.
  const { data: last } = await supabase
    .from("managers")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);

  const { data, error } = await supabase
    .from("managers")
    .insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
    .select("id, name, is_active, sort_order")
    .single();

  if (error) return Response.json({ error: nameError(error) }, { status: 400 });
  return Response.json({ data });
}

export async function PATCH(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!body.id) return Response.json({ error: "id обязателен." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return Response.json({ error: "Укажите имя менеджера." }, { status: 400 });
    updates.name = name;
  }
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (Object.keys(updates).length === 0) return Response.json({ error: "Нечего менять." }, { status: 400 });

  const { data, error } = await supabase
    .from("managers")
    .update(updates)
    .eq("id", body.id)
    .select("id, name, is_active, sort_order")
    .single();

  if (error) return Response.json({ error: nameError(error) }, { status: 400 });
  return Response.json({ data });
}
