import { createAdminClient } from "../lib/supabase/server";
import { invalidateAccountCache } from "../lib/gemini";

export async function GET(req: Request) {
  const supabase = createAdminClient();
  const accountId = new URL(req.url).searchParams.get("bot_id");
  if (!accountId) return Response.json({ error: "bot_id обязателен." }, { status: 400 });

  const { data, error } = await supabase
    .from("system_rules")
    .select("id, account_id, rule_type, title, rule_text, is_active")
    .eq("account_id", accountId)
    .order("rule_type", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.title || !body.rule_text || !body.rule_type || !body.account_id) {
    return Response.json(
      { error: "Поля title, rule_text, rule_type и account_id обязательны." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("system_rules")
    .insert({
      title: body.title,
      rule_text: body.rule_text,
      rule_type: body.rule_type,
      is_active: body.is_active ?? true,
      account_id: body.account_id,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache(body.account_id);
  return Response.json({ data });
}

export async function PATCH(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.id) return Response.json({ error: "id обязателен." }, { status: 400 });

  const { data, error } = await supabase
    .from("system_rules")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.rule_text !== undefined && { rule_text: body.rule_text }),
      ...(body.is_active !== undefined && { is_active: body.is_active }),
    })
    .eq("id", body.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache(data?.account_id);
  return Response.json({ data });
}

export async function DELETE(req: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id обязателен." }, { status: 400 });

  const { error } = await supabase.from("system_rules").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  invalidateAccountCache();
  return Response.json({ ok: true });
}
