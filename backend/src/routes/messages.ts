import { createAdminClient } from "../lib/supabase/server";
import type { RouteContext } from "../index";

/** Переписка диалога. Менеджер видит только диалоги своих заявок. */
export async function GET(req: Request, ctx?: RouteContext) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return Response.json({ error: "session_id обязателен." }, { status: 400 });
  }

  const auth = ctx?.auth;
  if (auth && auth.role !== "owner") {
    const { data: own } = await supabase
      .from("leads")
      .select("id")
      .eq("session_id", sessionId)
      .eq("manager_id", auth.manager_id ?? "00000000-0000-0000-0000-000000000000")
      .limit(1);
    if (!own?.length) return Response.json({ error: "Это не ваш диалог." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.session_id || !body.text || !body.sender) {
    return Response.json(
      { error: "Поля session_id, sender и text обязательны." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      session_id: body.session_id,
      sender: body.sender,
      text: body.text,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}
