import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.quote_price !== undefined) updates.quote_price = body.quote_price;
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Если выставлена цена, отправляем сообщение клиенту от лица менеджера.
  if (body.quote_price !== undefined && data?.session_id) {
    await supabase.from("messages").insert({
      session_id: data.session_id,
      sender: "manager",
      text: `Ваш расчёт готов: ${body.quote_price} $. Логист свяжется с вами для уточнения деталей.`,
    });
    await supabase
      .from("leads")
      .update({ status: "quoted" })
      .eq("id", params.id);
  }

  return NextResponse.json({ data });
}
