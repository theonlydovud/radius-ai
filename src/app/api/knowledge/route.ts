import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("knowledge")
    .select("id, title, content, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.title || !body.content) {
    return NextResponse.json(
      { error: "Поля title и content обязательны." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("knowledge")
    .insert({ title: body.title, content: body.content })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const supabase = createAdminClient();
  const body = await req.json();

  if (!body.id) return NextResponse.json({ error: "id обязателен." }, { status: 400 });
  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json(
      { error: "Поля title и content обязательны." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("knowledge")
    .update({ title: body.title, content: body.content })
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

  const { error } = await supabase.from("knowledge").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
