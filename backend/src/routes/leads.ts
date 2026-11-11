import { createAdminClient } from "../lib/supabase/server";
import { fetchLead, fetchLeads, ownManagerFilter, STATUS_GROUPS } from "../lib/leads";
import { assignNextManager } from "../lib/managers";
import type { RouteContext } from "../index";

/**
 * Список заявок. Фильтры:
 *   status  = active (по умолчанию) | sold | not_sold | all
 *   manager = id менеджера | none (без ответственного)
 *   from, to — период по дате создания (ISO)
 *   account — id Instagram-аккаунта
 * Менеджер всегда получает только свои заявки, фильтр manager для него игнорируется.
 */
export async function GET(req: Request, ctx?: RouteContext) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "active";
  if (status !== "all" && !STATUS_GROUPS[status]) {
    return Response.json({ error: "Неизвестный статус." }, { status: 400 });
  }

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    return Response.json({ error: "Неверная дата." }, { status: 400 });
  }

  try {
    const data = await fetchLeads(createAdminClient(), {
      group: status === "all" ? undefined : status,
      manager: ownManagerFilter(ctx?.auth) ?? searchParams.get("manager") ?? undefined,
      account: searchParams.get("account") || undefined,
      from,
      to,
    });
    return Response.json({ data });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Не удалось загрузить заявки." }, { status: 500 });
  }
}

/** Поле формы: обрезанная строка не длиннее max символов, пустая — undefined. */
function field(value: unknown, max: number) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return v || undefined;
}

/**
 * Заявка вручную (клиент позвонил, написал в другой канал и т. п.).
 *   { client_name, client_phone, origin_city?, destination_city?, weight?, cargo_type?, note?, manager_id? }
 * Менеджер создаёт заявку только себе — она сразу «В работе».
 * Руководитель и супер-админ выбирают ответственного: id менеджера, "auto" — следующий
 * по очереди, null — без ответственного. Такая заявка — «Новая».
 */
export async function POST(req: Request, ctx?: RouteContext) {
  const auth = ctx?.auth;
  if (!auth) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  const client_name = field(body.client_name, 100);
  const client_phone = field(body.client_phone, 40);
  if (!client_name || !client_phone) return Response.json({ error: "Укажите имя клиента и телефон." }, { status: 400 });
  if (client_phone.replace(/\D/g, "").length < 5) return Response.json({ error: "Проверьте номер телефона." }, { status: 400 });

  let manager_id: string | null = null;
  if (auth.role === "manager") {
    if (!auth.manager_id) return Response.json({ error: "Вы не привязаны к очереди менеджеров." }, { status: 403 });
    manager_id = auth.manager_id;
  } else if (body.manager_id === "auto") {
    manager_id = (await assignNextManager(supabase))?.id ?? null;
  } else if (body.manager_id) {
    const { data: m } = await supabase.from("managers").select("id").eq("id", body.manager_id).maybeSingle();
    if (!m) return Response.json({ error: "Менеджер не найден." }, { status: 400 });
    manager_id = m.id;
  }

  const collected_data = Object.fromEntries(
    Object.entries({
      origin_city: field(body.origin_city, 60),
      destination_city: field(body.destination_city, 60),
      weight: field(body.weight, 60),
      cargo_type: field(body.cargo_type, 100),
      note: field(body.note, 1000),
      created_by: auth.name,
      // Аккаунт, выбранный в панели при создании: заявка видна в его разделе.
      account_id: typeof body.account_id === "string" && /^[0-9a-f-]{36}$/i.test(body.account_id) ? body.account_id : undefined,
    }).filter(([, v]) => v !== undefined)
  );

  const { data, error } = await supabase
    .from("leads")
    .insert({
      session_id: null,
      client_name,
      client_phone,
      collected_data,
      status: auth.role === "manager" ? "in_progress" : "new",
      manager_id,
    })
    .select("id")
    .single();
  if (error) {
    // До migration-manual-leads.sql база требует переписку у каждой заявки.
    const hint = /session_id/.test(error.message) ? " Выполните migration-manual-leads.sql в Supabase." : "";
    return Response.json({ error: `Не удалось создать заявку.${hint}` }, { status: 500 });
  }
  return Response.json({ data: await fetchLead(supabase, data.id) }, { status: 201 });
}
