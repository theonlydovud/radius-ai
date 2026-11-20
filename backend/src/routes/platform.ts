import { createAdminClient } from "../lib/supabase/server";
import { clearCookie, COMPANY_COOKIE, describeCompany, platformSession, platformToken, setCookie, USER_COOKIE } from "../lib/auth";

/**
 * Владелец платформы DexaAI (lib/platform.ts):
 *   GET  /api/platform/companies         → все компании: тариф, статус, сообщения, Instagram, сотрудники
 *   POST /api/platform/enter { company_id } → войти в компанию руководителем-«невидимкой»
 *   POST /api/platform/exit               → вернуться к списку компаний
 * Только по куке владельца платформы; всем остальным — 404.
 */

const json = (data: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(data), { status, headers });
};
const notFound = () => json({ error: "Not found" }, 404);

export const companies = {
  async GET(req: Request) {
    const p = await platformSession(req);
    if (!p) return notFound();
    const supabase = createAdminClient();
    const [{ data: rows }, { data: accounts }, { data: users }] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: true }),
      supabase.from("accounts").select("company_id, account_name, status"),
      supabase.from("app_users").select("company_id, name, role, is_active"),
    ]);
    const data = await Promise.all(
      (rows ?? []).map(async (c: any) => {
        const info = await describeCompany(c);
        return {
          id: c.id,
          name: c.name,
          created_at: c.created_at,
          status: info.status,
          plan: info.plan?.name ?? null,
          unlimited: info.unlimited,
          usage: info.usage,
          ai_blocked: info.ai_blocked,
          instagram: (accounts ?? []).filter((a: any) => a.company_id === c.id).map((a: any) => ({ name: a.account_name, status: a.status })),
          users: (users ?? []).filter((u: any) => u.company_id === c.id && u.is_active).map((u: any) => ({ name: u.name, role: u.role })),
          current: c.id === p.companyId,
        };
      })
    );
    return json({ data });
  },
};

export const enter = {
  async POST(req: Request) {
    const p = await platformSession(req);
    if (!p) return notFound();
    const body = await req.json().catch(() => ({}));
    const { data: row } = await createAdminClient().from("companies").select("*").eq("id", String(body.company_id ?? "")).maybeSingle();
    if (!row) return json({ error: "Компания не найдена." }, 404);
    const company = await describeCompany(row);
    return json({ data: { company, next: company.status === "expired" ? "/cabinet" : "/leads" } }, 200, [
      ...clearCookie(COMPANY_COOKIE, req),
      setCookie(USER_COOKIE, platformToken(p.telegramId, row.id), req),
    ]);
  },
};

export const exit = {
  async POST(req: Request) {
    const p = await platformSession(req);
    if (!p) return notFound();
    return json({ ok: true }, 200, [setCookie(USER_COOKIE, platformToken(p.telegramId, null), req)]);
  },
};
