import { createAdminClient } from "../lib/supabase/server";
import { fetchLeads, ownManagerFilter, STATUS_GROUPS } from "../lib/leads";
import { createManualLead } from "../lib/manual-lead";
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

/** Заявка вручную (форма «Новая заявка»). Логика — в lib/manual-lead.ts, её же использует ИИ-ассистент. */
export async function POST(req: Request, ctx?: RouteContext) {
  const auth = ctx?.auth;
  if (!auth) return Response.json({ error: "Войдите в аккаунт." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { created_by: _ignored, ...input } = body ?? {};
  const result = await createManualLead(auth, input);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ data: result.lead }, { status: 201 });
}
