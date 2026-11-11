import { createAdminClient } from "../lib/supabase/server";

/** История чатов. ?account=<id> — только диалоги этого Instagram-аккаунта. */
export async function GET(req: Request) {
  const supabase = createAdminClient();
  const account = new URL(req.url).searchParams.get("account");
  let q = supabase
    .from("chat_sessions")
    .select("*, accounts(platform, account_name)")
    .order("created_at", { ascending: false });
  if (account) q = q.eq("account_id", account);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}
