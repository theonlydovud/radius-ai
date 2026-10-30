import { createAdminClient } from "../lib/supabase/server";
import { fetchLeads, STATUS_GROUPS } from "../lib/leads";

/**
 * Список заявок. Фильтры:
 *   status  = active (по умолчанию) | sold | not_sold | all
 *   manager = id менеджера | none (без ответственного)
 *   from, to — период по дате создания (ISO)
 */
export async function GET(req: Request) {
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
      manager: searchParams.get("manager") ?? undefined,
      from,
      to,
    });
    return Response.json({ data });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Не удалось загрузить заявки." }, { status: 500 });
  }
}
