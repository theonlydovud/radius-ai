import { createAdminClient } from "../lib/supabase/server";
import { companyAccountIds } from "../lib/tenant";
import type { RouteContext } from "../index";

/** История чатов компании. ?account=<id> — только диалоги этого Instagram-аккаунта. */
export async function GET(req: Request, ctx: RouteContext) {
  const supabase = createAdminClient();
  const accountIds = await companyAccountIds(ctx.auth!.company.id);
  const account = new URL(req.url).searchParams.get("account");
  const scope = account ? accountIds.filter((id) => id === account) : accountIds;
  if (scope.length === 0) return Response.json({ data: [] });

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*, accounts(platform, account_name)")
    .in("account_id", scope)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}
