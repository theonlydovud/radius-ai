import { createAdminClient } from "../lib/supabase/server";
import { ownsSession } from "../lib/tenant";
import type { RouteContext } from "../index";

export async function PATCH(req: Request, { params, auth }: RouteContext) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.status) {
    return Response.json({ error: "status обязателен." }, { status: 400 });
  }
  if (!(await ownsSession(auth!.company.id, params.id))) {
    return Response.json({ error: "Диалог не найден." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ status: body.status })
    .eq("id", params.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}
