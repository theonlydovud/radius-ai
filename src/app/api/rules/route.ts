import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("system_rules")
    .select("id, rule_type, title, rule_text, is_active")
    .order("rule_type", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.title || !body.rule_text || !body.rule_type) {
    return NextResponse.json(
      { error: "Поля title, rule_text и rule_type обязательны." },
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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.id) return NextResponse.json({ error: "id обязателен." }, { status: 400 });

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен." }, { status: 400 });

  const { error } = await supabase.from("system_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
