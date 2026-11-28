import { createAdminClient } from "../lib/supabase/server";
import type { RouteContext } from "../index";
import { ownsSession } from "../lib/tenant";
import { sendInstagramMessage } from "../lib/instagram";

/** Переписка диалога. Менеджер видит только диалоги своих заявок. */
export async function GET(req: Request, ctx?: RouteContext) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return Response.json({ error: "session_id обязателен." }, { status: 400 });
  }

  const auth = ctx?.auth;
  if (!(await ownsSession(auth!.company.id, sessionId))) return Response.json({ error: "Диалог не найден." }, { status: 404 });
  if (auth?.role === "manager") {
    const { data: own } = await supabase
      .from("leads")
      .select("id")
      .eq("session_id", sessionId)
      .eq("manager_id", auth.manager_id ?? "00000000-0000-0000-0000-000000000000")
      .limit(1);
    // Переписка с партнёром (водителем) — общая база компании: её видят все логисты.
    const { data: partner } = own?.length
      ? { data: own }
      : await supabase.from("leads").select("id").eq("session_id", sessionId).eq("company_id", auth.company.id).eq("kind", "partner").limit(1);
    if (!partner?.length) return Response.json({ error: "Это не ваш диалог." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(req: Request, ctx?: RouteContext) {
  const supabase = createAdminClient();
  const body = await req.json();
  if (!(await ownsSession(ctx!.auth!.company.id, body.session_id))) return Response.json({ error: "Диалог не найден." }, { status: 404 });

  if (!body.session_id || !body.text || !body.sender) {
    return Response.json(
      { error: "Поля session_id, sender и text обязательны." },
      { status: 400 }
    );
  }

  // Менеджер пишет только в диалоги своих заявок (и в общие диалоги с партнёрами) и только как «manager».
  if (ctx!.auth!.role === "manager") {
    if (body.sender !== "manager") return Response.json({ error: "Менеджер отправляет только свои ответы." }, { status: 403 });
    const { data: own } = await supabase
      .from("leads")
      .select("id")
      .eq("session_id", body.session_id)
      .eq("company_id", ctx!.auth!.company.id)
      .or(`manager_id.eq.${ctx!.auth!.manager_id ?? "00000000-0000-0000-0000-000000000000"},kind.eq.partner`)
      .limit(1);
    if (!own?.length) return Response.json({ error: "Это не ваш диалог." }, { status: 403 });
  }

  if (body.sender === "manager") {
    const { data: session } = await supabase.from("chat_sessions").select("account_id, client_id").eq("id", body.session_id).single();
    if (!session) return Response.json({ error: "Диалог не найден." }, { status: 404 });
    const { data: account } = await supabase.from("accounts").select("access_token").eq("id", session.account_id).maybeSingle();
    if (!account?.access_token) return Response.json({ error: "Instagram-аккаунт не подключён." }, { status: 400 });
    try {
      await sendInstagramMessage(account.access_token, session.client_id, String(body.text));
    } catch (e: any) {
      return Response.json({ error: e?.message ?? "Не удалось отправить сообщение в Instagram." }, { status: 502 });
    }

    await supabase.from("chat_sessions").update({ status: "manager_takeover" }).eq("id", body.session_id);
    await supabase.from("messages").insert({ session_id: body.session_id, sender: "manager", text: body.text });
    return Response.json({ success: true });
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
