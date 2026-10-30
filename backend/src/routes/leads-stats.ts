import { createAdminClient } from "../lib/supabase/server";
import { buildLeadStats, fetchLeads } from "../lib/leads";

function validTimeZone(tz: string | null) {
  try {
    if (tz) {
      new Intl.DateTimeFormat("en-CA", { timeZone: tz });
      return tz;
    }
  } catch {
    /* неизвестный пояс — берём пояс компании */
  }
  return "Asia/Tashkent";
}

/** Статистика по заявкам, созданным за период: from, to (ISO), tz — пояс для графика по дням. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    return Response.json({ error: "Неверная дата." }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const [leads, managers] = await Promise.all([
      fetchLeads(supabase, { from, to }),
      supabase.from("managers").select("id, name, is_active").order("sort_order", { ascending: true }),
    ]);
    if (managers.error) throw new Error(managers.error.message);

    return Response.json({
      data: buildLeadStats(leads, managers.data ?? [], { from, to, timeZone: validTimeZone(searchParams.get("tz")) }),
    });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Не удалось посчитать статистику." }, { status: 500 });
  }
}
