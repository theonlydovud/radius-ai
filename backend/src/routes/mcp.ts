import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../lib/supabase/server";
import { invalidateAccountCache } from "../lib/gemini";
import { companyInfo, type AuthUser } from "../lib/auth";
import { fetchLead, fetchLeads, leadControl, STATUS_GROUPS } from "../lib/leads";
import { PATCH as patchLead } from "./leads-id";

/**
 * MCP-сервер компании (Claude и другие клиенты MCP): POST /api/mcp, JSON-RPC 2.0, Streamable HTTP.
 * Вход — заголовок Authorization: Bearer <ключ компании> (Настройки → MCP). Сессия сайта не нужна,
 * поэтому путь открыт в index.ts, а ключ проверяется здесь. Ключ хранится только хешем (settings.mcp.key_hash).
 *
 * Заявки меняются через тот же обработчик, что и карточка в CRM (routes/leads-id.ts): те же правила
 * закрытия, проверки этапов воронки и менеджеров только своей компании.
 */

const TOOLS = [
  { name: "list_accounts", description: "Список Instagram-аккаунтов компании", inputSchema: { type: "object", properties: {} } },
  { name: "get_ai_role", description: "Получить роль ИИ аккаунта", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "update_ai_role", description: "Заполнить или изменить роль ИИ аккаунта", inputSchema: { type: "object", properties: { account_id: { type: "string" }, prompt: { type: "string" } }, required: ["account_id", "prompt"] } },
  { name: "list_knowledge", description: "Показать базу знаний аккаунта", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "add_knowledge", description: "Добавить запись в базу знаний", inputSchema: { type: "object", properties: { account_id: { type: "string" }, title: { type: "string" }, content: { type: "string" } }, required: ["account_id", "title", "content"] } },
  {
    name: "list_leads",
    description: "Заявки компании. status: active | offered | overdue | sold | not_sold | all (по умолчанию active); q — поиск по имени, телефону, данным заявки",
    inputSchema: { type: "object", properties: { status: { type: "string" }, q: { type: "string" } } },
  },
  { name: "get_lead", description: "Получить одну заявку", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  {
    name: "update_lead",
    description:
      "Изменить заявку по правилам CRM: status (in_progress | offered | sold | not_sold — только этапы воронки компании), " +
      "для not_sold обязательна lost_reason (код причины из настроек компании, «other» — с lost_comment); manager_id — менеджер этой компании или null",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
        lost_reason: { type: "string" },
        lost_comment: { type: "string" },
        manager_id: { type: ["string", "null"] },
      },
      required: ["id"],
    },
  },
  { name: "list_managers", description: "Список менеджеров компании", inputSchema: { type: "object", properties: {} } },
  { name: "list_sessions", description: "Список переписок", inputSchema: { type: "object", properties: { account_id: { type: "string" } } } },
  { name: "get_messages", description: "Получить переписку по диалогу", inputSchema: { type: "object", properties: { session_id: { type: "string" } }, required: ["session_id"] } },
  {
    name: "set_session_takeover",
    description: "Передать диалог менеджеру (бот молчит) или вернуть ИИ",
    inputSchema: { type: "object", properties: { session_id: { type: "string" }, status: { type: "string", enum: ["manager_takeover", "ai_active"] } }, required: ["session_id", "status"] },
  },
];

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Компания по ключу MCP. Сравнение хешей — без утечки по времени. */
async function companyByToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("dexa_mcp_")) return null;
  const hash = Buffer.from(sha256(token));
  const { data } = await createAdminClient().from("companies").select("id, name, settings").limit(1000);
  return (
    (data ?? []).find((c: any) => {
      const stored = Buffer.from(String(c.settings?.mcp?.key_hash ?? ""));
      return stored.length === hash.length && timingSafeEqual(stored, hash);
    }) ?? null
  );
}

async function ownsAccount(supabase: any, companyId: string, accountId: string) {
  const r = await supabase.from("accounts").select("id").eq("company_id", companyId).eq("id", accountId).maybeSingle();
  return Boolean(r.data);
}

async function ownsSession(supabase: any, companyId: string, sessionId: string) {
  const r = await supabase.from("chat_sessions").select("id, accounts(company_id)").eq("id", sessionId).maybeSingle();
  return r.data?.accounts?.company_id === companyId;
}

const rpc = (id: any, result: any) => Response.json({ jsonrpc: "2.0", id, result });
const rpcError = (id: any, code: number, message: string) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });
/** Результат инструмента в формате MCP: текстовый блок с JSON (его читает Claude). */
const toolResult = (id: any, data: unknown, isError = false) =>
  rpc(id, { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) });

class ToolError extends Error {}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return rpcError(null, -32700, "Parse error");

  if (body.method === "initialize") {
    return rpc(body.id, {
      protocolVersion: body.params?.protocolVersion ?? "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "dexa-ai", version: "1.1.0" },
    });
  }
  // Уведомления (без id) — ответ без тела.
  if (typeof body.method === "string" && body.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (body.method === "ping") return rpc(body.id, {});

  const company = await companyByToken(req);
  if (!company) return rpcError(body.id, -32001, "Invalid MCP API key");
  const supabase = createAdminClient();

  if (body.method === "tools/list") return rpc(body.id, { tools: TOOLS });
  if (body.method !== "tools/call") return rpcError(body.id, -32601, "Method not found");
  const name = body.params?.name;
  const args = body.params?.arguments ?? {};

  try {
    let data: unknown;
    if (name === "list_accounts") {
      data = (await supabase.from("accounts").select("id, account_name, platform, status").eq("company_id", company.id)).data ?? [];
    } else if (name === "get_ai_role") {
      const q = await supabase.from("accounts").select("id, account_name, ai_prompt").eq("company_id", company.id).eq("id", args.account_id).maybeSingle();
      if (!q.data) throw new ToolError("Аккаунт не найден");
      data = q.data;
    } else if (name === "update_ai_role") {
      const prompt = String(args.prompt ?? "").replace(/\r\n/g, "\n").trim();
      if (prompt.length > 40000) throw new ToolError("Слишком длинно: максимум 40000 символов");
      const q = await supabase.from("accounts").update({ ai_prompt: prompt || null }).eq("company_id", company.id).eq("id", args.account_id).select("id, account_name, ai_prompt").maybeSingle();
      if (!q.data) throw new ToolError("Аккаунт не найден");
      invalidateAccountCache(args.account_id);
      data = q.data;
    } else if (name === "list_knowledge") {
      if (!(await ownsAccount(supabase, company.id, args.account_id))) throw new ToolError("Аккаунт не найден");
      data = (await supabase.from("knowledge").select("id, title, content, created_at").eq("account_id", args.account_id).order("created_at", { ascending: false })).data ?? [];
    } else if (name === "add_knowledge") {
      if (!(await ownsAccount(supabase, company.id, args.account_id))) throw new ToolError("Аккаунт не найден");
      if (!args.title || !args.content) throw new ToolError("title и content обязательны");
      const q = await supabase.from("knowledge").insert({ account_id: args.account_id, title: String(args.title), content: String(args.content) }).select("id, title, content, created_at").single();
      if (!q.data) throw new ToolError("Ошибка при добавлении записи в базу знаний");
      invalidateAccountCache(args.account_id);
      data = q.data;
    } else if (name === "list_leads") {
      const info = await companyInfo(company.id);
      const status = String(args.status ?? "active");
      if (status !== "all" && !STATUS_GROUPS[status]) throw new ToolError("Неизвестный статус. Можно: active, offered, overdue, sold, not_sold, all");
      data = await fetchLeads(
        supabase,
        { company: company.id, group: status === "all" ? undefined : status, overdue: status === "overdue", search: args.q ? String(args.q) : undefined },
        { control: info ? leadControl(info.settings) : null, showMargin: true }
      );
    } else if (name === "get_lead") {
      const lead = await fetchLead(supabase, String(args.id ?? ""), company.id, { showMargin: true });
      if (!lead) throw new ToolError("Заявка не найдена");
      data = lead;
    } else if (name === "update_lead") {
      data = await updateLeadByRules(company.id, args);
    } else if (name === "list_managers") {
      data = (await supabase.from("managers").select("id, name, is_active, sort_order").eq("company_id", company.id).order("sort_order", { ascending: true })).data ?? [];
    } else if (name === "list_sessions") {
      const accountIds = ((await supabase.from("accounts").select("id").eq("company_id", company.id)).data ?? []).map((x: any) => x.id);
      if (args.account_id && !accountIds.includes(args.account_id)) throw new ToolError("Аккаунт не найден");
      const ids = args.account_id ? [args.account_id] : accountIds;
      data = ids.length
        ? (await supabase.from("chat_sessions").select("id, account_id, client_id, client_name, status, created_at").in("account_id", ids).order("created_at", { ascending: false }).limit(200)).data ?? []
        : [];
    } else if (name === "get_messages") {
      if (!(await ownsSession(supabase, company.id, args.session_id))) throw new ToolError("Диалог не найден");
      data = (await supabase.from("messages").select("id, sender, text, created_at").eq("session_id", args.session_id).order("created_at", { ascending: true })).data ?? [];
    } else if (name === "set_session_takeover") {
      if (!(await ownsSession(supabase, company.id, args.session_id))) throw new ToolError("Диалог не найден");
      if (!["manager_takeover", "ai_active"].includes(args.status)) throw new ToolError("Неверный статус");
      const q = await supabase.from("chat_sessions").update({ status: args.status }).eq("id", args.session_id).select("id, account_id, client_name, status").maybeSingle();
      if (!q.data) throw new ToolError("Диалог не найден");
      data = q.data;
    } else {
      return rpcError(body.id, -32602, `Неизвестный инструмент: ${name}`);
    }
    return toolResult(body.id, data);
  } catch (e: any) {
    // Ошибка инструмента — результат с isError (так её видит модель); остальное — тоже, но с текстом.
    return toolResult(body.id, e?.message ?? "Unknown error", true);
  }
}

/**
 * Изменить заявку по тем же правилам, что карточка в CRM: вызываем её обработчик PATCH
 * от имени руководителя «Claude (MCP)». Он сам проверит этапы воронки, причины отказа,
 * блок сделки и то, что менеджер — из этой компании.
 */
async function updateLeadByRules(companyId: string, args: any) {
  const company = await companyInfo(companyId);
  if (!company) throw new ToolError("Компания не найдена");
  const auth: AuthUser = { id: "mcp", name: "Claude (MCP)", role: "owner", manager_id: null, company, telegram_linked: false, platform: false };
  const patch: Record<string, unknown> = {};
  for (const k of ["status", "lost_reason", "lost_comment", "manager_id"]) if (args[k] !== undefined) patch[k] = args[k];
  if (patch.status === "sold" || patch.status === "not_sold") patch.closed_by = auth.name;
  if (!Object.keys(patch).length) throw new ToolError("Нечего менять: укажите status или manager_id");
  const res = await patchLead(new Request("http://mcp.local/lead", { method: "PATCH", body: JSON.stringify(patch) }), { params: { id: String(args.id ?? "") }, auth });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ToolError(j.error ?? "Не удалось изменить заявку");
  return j.data;
}
