import { createAdminClient } from "../lib/supabase/server";
import { clearCookie, COMPANY_COOKIE, describeCompany, invalidateAuthCache, platformSession, platformToken, setCookie, USER_COOKIE } from "../lib/auth";
import { getPlans } from "../lib/plans";

/**
 * Владелец платформы DexaAI (lib/platform.ts) — панель управления:
 *   GET  /api/platform/companies           → все компании: тариф, статус, блокировка, сообщения, Instagram, сотрудники
 *   GET  /api/platform/overview            → сводка: компании, тарифы, выручка в месяц, сообщения, безопасность
 *   POST /api/platform/action { company_id, action, … } → заморозить, забанить, разбанить, тариф, продлить, сообщения, удалить
 *   GET  /api/platform/security            → журнал безопасности; POST — отметить просмотренным
 *   POST /api/platform/enter { company_id } → войти в компанию руководителем-«невидимкой»
 *   POST /api/platform/exit                → вернуться к панели
 * Только по куке владельца платформы; всем остальным — 404.
 */

const json = (data: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(data), { status, headers });
};
const notFound = () => json({ error: "Not found" }, 404);
const DAY = 86_400_000;

export const companies = {
  async GET(req: Request) {
    const p = await platformSession(req);
    if (!p) return notFound();
    const supabase = createAdminClient();
    const [{ data: rows }, { data: accounts }, { data: users }, { data: events }] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: true }),
      supabase.from("accounts").select("company_id, account_name, status"),
      supabase.from("app_users").select("id, company_id, name, role, is_active, login"),
      supabase.from("security_events").select("company_id, severity").eq("reviewed", false),
    ]);
    const data = await Promise.all(
      (rows ?? []).map(async (c: any) => {
        const info = await describeCompany(c);
        const open = (events ?? []).filter((e: any) => e.company_id === c.id);
        return {
          id: c.id,
          name: c.name,
          created_at: c.created_at,
          status: info.status,
          plan: info.plan?.name ?? null,
          plan_code: info.plan?.code ?? null,
          unlimited: info.unlimited,
          usage: info.usage,
          ai_blocked: info.ai_blocked,
          blocked: info.blocked,
          blocked_reason: info.blocked_reason,
          trial_ends_at: info.trial_ends_at,
          subdomain: info.subdomain,
          security: { open: open.length, high: open.filter((e: any) => e.severity === "high").length },
          instagram: (accounts ?? []).filter((a: any) => a.company_id === c.id).map((a: any) => ({ name: a.account_name, status: a.status })),
          users: (users ?? []).filter((u: any) => u.company_id === c.id && u.is_active).map((u: any) => ({ id: u.id, name: u.name, role: u.role, login: u.login })),
          current: c.id === p.companyId,
        };
      })
    );
    return json({ data });
  },
};

/** Сводка по всей платформе. */
export const overview = {
  async GET(req: Request) {
    if (!(await platformSession(req))) return notFound();
    const supabase = createAdminClient();
    const [{ data: rows }, { data: events }] = await Promise.all([
      supabase.from("companies").select("*"),
      supabase.from("security_events").select("severity").eq("reviewed", false),
    ]);
    const plans = await getPlans();
    const list = await Promise.all((rows ?? []).map((c: any) => describeCompany(c)));
    const weekAgo = Date.now() - 7 * DAY;
    const byPlan: Record<string, number> = {};
    let mrr = 0;
    for (const c of list) {
      if (c.plan) byPlan[c.plan.name] = (byPlan[c.plan.name] ?? 0) + 1;
      // Платят активные, не наши (unlimited), не на пробном и не заблокированные.
      if (c.status === "active" && !c.unlimited && c.plan && !c.blocked) mrr += plans.find((x) => x.code === c.plan!.code)?.price ?? 0;
    }
    return json({
      data: {
        companies: list.length,
        active: list.filter((c) => c.status === "active" && !c.blocked).length,
        trial: list.filter((c) => c.status === "trial" && !c.blocked).length,
        expired: list.filter((c) => c.status === "expired").length,
        frozen: list.filter((c) => c.blocked === "frozen").length,
        banned: list.filter((c) => c.blocked === "banned").length,
        new_7d: (rows ?? []).filter((r: any) => Date.parse(r.created_at) >= weekAgo).length,
        by_plan: byPlan,
        mrr,
        messages_used: list.reduce((n, c) => n + (c.usage.messages_used || 0), 0),
        security_open: { high: (events ?? []).filter((e: any) => e.severity === "high").length, total: (events ?? []).length },
      },
    });
  },
};

/**
 * Действия над компанией:
 *   freeze { reason }  — бот молчит, кабинет открыт, сверху причина
 *   ban { reason }     — вход закрыт всем сотрудникам, бот молчит
 *   unblock            — снять заморозку или бан
 *   plan { plan }      — сменить тариф: активный, новый 30-дневный период, счётчик сообщений с нуля
 *   extend { days }    — продлить оплаченный или пробный период
 *   messages { add } / { reset: true } — вернуть сообщения (вычесть из использованных) или обнулить счётчик
 *   delete { confirm } — удалить компанию со всеми данными; confirm — точное название компании
 */
export const action = {
  async POST(req: Request) {
    const p = await platformSession(req);
    if (!p) return notFound();
    const body = await req.json().catch(() => ({}));
    const supabase = createAdminClient();
    const { data: c } = await supabase.from("companies").select("*").eq("id", String(body.company_id ?? "")).maybeSingle();
    if (!c) return json({ error: "Компания не найдена." }, 404);
    const now = new Date();
    const reason = String(body.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null;
    const update = async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("companies").update(patch).eq("id", c.id);
      if (error) {
        const hint = /blocked/.test(error.message) ? " Выполните migration-platform-admin.sql в Supabase." : "";
        throw new Error(error.message + hint);
      }
      invalidateAuthCache();
    };

    try {
      switch (body.action) {
        case "freeze":
        case "ban":
          if (!reason) return json({ error: "Укажите причину — её увидит компания." }, 400);
          await update({ blocked: body.action === "freeze" ? "frozen" : "banned", blocked_reason: reason, blocked_at: now.toISOString() });
          console.warn(`[platform] ${body.action} «${c.name}»: ${reason}`);
          break;
        case "unblock":
          await update({ blocked: null, blocked_reason: null, blocked_at: null });
          break;
        case "plan": {
          const plan = (await getPlans()).find((x) => x.code === body.plan);
          if (!plan) return json({ error: "Неизвестный тариф." }, 400);
          await update({
            plan: plan.code,
            status: "active",
            period_start: now.toISOString(),
            period_end: new Date(now.getTime() + 30 * DAY).toISOString(),
            messages_used: 0,
            limit_notified_at: null,
          });
          break;
        }
        case "extend": {
          const days = Math.round(Number(body.days));
          if (!Number.isFinite(days) || days < 1 || days > 366) return json({ error: "Сколько дней продлить: от 1 до 366." }, 400);
          if (c.status === "trial" || c.status === "pending") {
            const from = Math.max(Date.now(), Date.parse(c.trial_ends_at ?? "") || 0);
            await update({ trial_ends_at: new Date(from + days * DAY).toISOString() });
          } else {
            const from = Math.max(Date.now(), Date.parse(c.period_end ?? "") || 0);
            await update({ period_end: new Date(from + days * DAY).toISOString(), limit_notified_at: null });
          }
          break;
        }
        case "messages": {
          if (body.reset === true) await update({ messages_used: 0, limit_notified_at: null });
          else {
            const add = Math.round(Number(body.add));
            if (!Number.isFinite(add) || add < 1 || add > 1_000_000) return json({ error: "Сколько сообщений добавить." }, 400);
            await update({ messages_used: Math.max(0, (Number(c.messages_used) || 0) - add), limit_notified_at: null });
          }
          break;
        }
        case "delete": {
          if (String(body.confirm ?? "").trim() !== c.name) return json({ error: `Для удаления введите точное название: «${c.name}».` }, 400);
          await deleteCompany(c.id);
          console.warn(`[platform] удалена компания «${c.name}» (${c.id})`);
          return json({ data: { deleted: true } });
        }
        default:
          return json({ error: "Неизвестное действие." }, 400);
      }
    } catch (e: any) {
      return json({ error: e?.message ?? "Не получилось." }, 500);
    }
    const { data: fresh } = await supabase.from("companies").select("*").eq("id", c.id).maybeSingle();
    return json({ data: { company: fresh ? await describeCompany(fresh) : null } });
  },
};

/**
 * Удалить компанию целиком. Аккаунты, менеджеры, заявки, сотрудники, знания и правила
 * уходят каскадом вместе с компанией; переписки (chat_sessions → messages) — явно, заранее.
 */
async function deleteCompany(companyId: string) {
  const supabase = createAdminClient();
  const { data: accounts } = await supabase.from("accounts").select("id").eq("company_id", companyId);
  const accountIds = (accounts ?? []).map((a: any) => a.id);
  await supabase.from("leads").delete().eq("company_id", companyId);
  if (accountIds.length) {
    const { data: sessions } = await supabase.from("chat_sessions").select("id").in("account_id", accountIds);
    const ids = (sessions ?? []).map((s: any) => s.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      await supabase.from("messages").delete().in("session_id", chunk);
      await supabase.from("chat_sessions").delete().in("id", chunk);
    }
  }
  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) throw new Error(error.message);
  invalidateAuthCache();
}

/**
 * Журнал безопасности:
 *   GET  ?company=&all=1 — по умолчанию непросмотренные, свежие сверху
 *   POST { id } | { company_id } — отметить просмотренным (одно событие или все по компании)
 */
export const security = {
  async GET(req: Request) {
    if (!(await platformSession(req))) return notFound();
    const url = new URL(req.url);
    let q = createAdminClient()
      .from("security_events")
      .select("id, company_id, source, kind, severity, excerpt, matched, reviewed, created_at, companies(name, blocked)")
      .order("created_at", { ascending: false })
      .limit(300);
    const company = url.searchParams.get("company");
    if (company) q = q.eq("company_id", company);
    if (url.searchParams.get("all") !== "1") q = q.eq("reviewed", false);
    const { data, error } = await q;
    if (error) return json({ data: [], error: /security_events/.test(error.message) ? "Выполните migration-platform-admin.sql в Supabase." : error.message });
    return json({ data: (data ?? []).map(({ companies: co, ...e }: any) => ({ ...e, company: co ?? null })) });
  },
  async POST(req: Request) {
    if (!(await platformSession(req))) return notFound();
    const body = await req.json().catch(() => ({}));
    let q = createAdminClient().from("security_events").update({ reviewed: true });
    if (body.id) q = q.eq("id", String(body.id));
    else if (body.company_id) q = q.eq("company_id", String(body.company_id));
    else return json({ error: "Укажите событие или компанию." }, 400);
    const { error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
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
    // user_id — войти от лица сотрудника (менеджер → его CRM с его заявками). Его сессию это не трогает.
    let asUser: { id: string; role: string } | null = null;
    if (body.user_id) {
      const { data: u } = await createAdminClient().from("app_users").select("id, role, company_id, is_active").eq("id", String(body.user_id)).maybeSingle();
      if (!u || u.company_id !== row.id || !u.is_active) return json({ error: "Сотрудник не найден." }, 404);
      asUser = u;
    }
    const home = asUser?.role === "manager" ? "/crm" : asUser?.role === "admin" ? "/admin" : "/leads";
    return json({ data: { company, next: company.status === "expired" ? "/cabinet" : home } }, 200, [
      ...clearCookie(COMPANY_COOKIE, req),
      setCookie(USER_COOKIE, platformToken(p.telegramId, row.id, asUser?.id), req),
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
