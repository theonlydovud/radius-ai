import { createAdminClient } from "../lib/supabase/server";
import { fetchLead, LOST_REASONS } from "../lib/leads";

const NOT_CLOSED = { closed_at: null, closed_by: null, lost_reason: null, lost_comment: null };

/**
 * Действия с заявкой:
 *   { status: "in_progress" }                                  — взять в работу / вернуть в работу
 *   { status: "sold", closed_by }                              — продано
 *   { status: "not_sold", closed_by, lost_reason, lost_comment? } — не продано, причина обязательна
 *   { manager_id: id | null }                                  — сменить ответственного
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.manager_id !== undefined) {
    if (body.manager_id !== null) {
      const { data: manager } = await supabase.from("managers").select("id").eq("id", body.manager_id).maybeSingle();
      if (!manager) return Response.json({ error: "Менеджер не найден." }, { status: 400 });
    }
    updates.manager_id = body.manager_id;
  }

  if (body.status !== undefined) {
    if (body.status === "in_progress") {
      Object.assign(updates, { status: "in_progress" }, NOT_CLOSED);
    } else if (body.status === "sold" || body.status === "not_sold") {
      const closedBy = String(body.closed_by ?? "").trim();
      if (!closedBy) return Response.json({ error: "Укажите, кто закрывает заявку." }, { status: 400 });

      const closed = { closed_at: new Date().toISOString(), closed_by: closedBy };
      if (body.status === "sold") {
        Object.assign(updates, { status: "sold", lost_reason: null, lost_comment: null }, closed);
      } else {
        if (!LOST_REASONS.includes(body.lost_reason)) {
          return Response.json({ error: "Выберите причину из списка." }, { status: 400 });
        }
        const comment = String(body.lost_comment ?? "").trim();
        Object.assign(updates, { status: "not_sold", lost_reason: body.lost_reason, lost_comment: comment || null }, closed);
      }
    } else {
      return Response.json({ error: "Неизвестный статус." }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Нечего менять." }, { status: 400 });
  }

  const { data: updated, error } = await supabase.from("leads").update(updates).eq("id", params.id).select("id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!updated) return Response.json({ error: "Заявка не найдена." }, { status: 404 });

  return Response.json({ data: await fetchLead(supabase, params.id) });
}
