import { createAdminClient } from "../lib/supabase/server";
import { createHash } from "node:crypto";
import { invalidateAccountCache } from "../lib/gemini";

const TOOLS = [
  { name: "list_accounts", description: "Список Instagram-аккаунтов компании", inputSchema: { type: "object", properties: {} } },
  { name: "get_ai_role", description: "Получить роль ИИ аккаунта", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "update_ai_role", description: "Заполнить или изменить роль ИИ аккаунта", inputSchema: { type: "object", properties: { account_id: { type: "string" }, prompt: { type: "string" } }, required: ["account_id", "prompt"] } },
  { name: "list_knowledge", description: "Показать базу знаний аккаунта", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "add_knowledge", description: "Добавить запись в базу знаний", inputSchema: { type: "object", properties: { account_id: { type: "string" }, title: { type: "string" }, content: { type: "string" } }, required: ["account_id", "title", "content"] } },
  { name: "list_leads", description: "Показать заявки компании", inputSchema: { type: "object", properties: { status: { type: "string" }, q: { type: "string" } } } },
  { name: "get_lead", description: "Получить одну заявку", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "update_lead", description: "Изменить статус или ответственного заявки", inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string" }, manager_id: { type: ["string", "null"] } }, required: ["id"] } },
  { name: "list_managers", description: "Список менеджеров компании", inputSchema: { type: "object", properties: {} } },
  { name: "list_sessions", description: "Список переписок", inputSchema: { type: "object", properties: { account_id: { type: "string" } } } },
  { name: "get_messages", description: "Получить переписку по диалогу", inputSchema: { type: "object", properties: { session_id: { type: "string" } }, required: ["session_id"] } },
  { name: "set_session_takeover", description: "Передать диалог менеджеру или вернуть ИИ", inputSchema: { type: "object", properties: { session_id: { type: "string" }, status: { type: "string", enum: ["manager_takeover", "ai_active"] } }, required: ["session_id", "status"] } },
];

async function companyByToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const supabase = createAdminClient();
  const { data } = await supabase.from("companies").select("id,name,settings").limit(1000);
  return (data ?? []).find((c: any) => c.settings?.mcp?.key_hash === hash) ?? null;
}

async function ownsAccount(supabase: any, companyId: string, accountId: string) {
  const r = await supabase.from("accounts").select("id").eq("company_id", companyId).eq("id", accountId).maybeSingle();
  return Boolean(r.data);
}

async function ownsSession(supabase: any, companyId: string, sessionId: string) {
  const r = await supabase.from("chat_sessions").select("id, account_id, accounts(company_id)").eq("id", sessionId).maybeSingle();
  return Boolean(r.data?.accounts?.company_id === companyId);
}

function rpc(id: any, result: any) { return Response.json({ jsonrpc: "2.0", id, result }); }
function rpcError(id: any, code: number, message: string) { return Response.json({ jsonrpc: "2.0", id, error: { code, message } }); }

export async function POST(req: Request) {
  const company = await companyByToken(req);
  const body = await req.json().catch(() => null);
  if (!body) return rpcError(null, -32700, "Parse error");

  if (body.method === "initialize") {
    return rpc(body.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "dexa-ai", version: "1.0.0" } });
  }

  if (!company) return rpcError(body.id, -32001, "Invalid MCP API key");
  const supabase = createAdminClient();

  if (body.method === "notifications/initialized") return new Response(null, { status: 204 });
  if (body.method === "tools/list") return rpc(body.id, { tools: TOOLS });

  if (body.method !== "tools/call") return rpcError(body.id, -32601, "Method not found");
  const name = body.params?.name;
  const args = body.params?.arguments ?? {};

  try {
    let data: any;
    if (name === "list_accounts") {
      const q = await supabase.from("accounts").select("id,account_name,platform,platform_account_id").eq("company_id", company.id);
      data = q.data ?? [];
    } else if (name === "get_ai_role") {
      const q = await supabase.from("accounts").select("id,account_name,ai_prompt").eq("company_id", company.id).eq("id", args.account_id).maybeSingle();
      if (!q.data) throw new Error("Аккаунт не найден"); data = q.data;
    } else if (name === "update_ai_role") {
      const prompt = String(args.prompt ?? "").replace(/\r\n/g, "\n").trim();
      if (prompt.length > 40000) throw new Error("Слишком длинно: максимум 40000 символов");
      const q = await supabase.from("accounts").update({ ai_prompt: prompt || null }).eq("company_id", company.id).eq("id", args.account_id).select("id,account_name,ai_prompt").maybeSingle();
      if (!q.data) throw new Error("Аккаунт не найден"); invalidateAccountCache(args.account_id); data = q.data;
    } else if (name === "list_knowledge") {
      if (!(await ownsAccount(supabase, company.id, args.account_id))) throw new Error("Аккаунт не найден");
      const q = await supabase.from("knowledge").select("id,title,content,created_at").eq("account_id", args.account_id).order("created_at", { ascending: false });
      data = q.data ?? [];
    } else if (name === "add_knowledge") {
      if (!(await ownsAccount(supabase, company.id, args.account_id))) throw new Error("Аккаунт не найден");
      if (!args.title || !args.content) throw new Error("title и content обязательны");
      const q = await supabase.from("knowledge").insert({ account_id: args.account_id, title: String(args.title), content: String(args.content) }).select("id,title,content,created_at").single();
      if (!q.data) throw new Error("Ошибка при добавлении записи в базу знаний");
      data = q.data;
    } else if (name === "list_leads") {
      const q = await supabase.from("leads").select("id,status,created_at,updated_at,manager_id,accounts(account_name)").eq("company_id", company.id).order("created_at", { ascending: false });
      data = q.data ?? [];
    } else if (name === "get_lead") {
      const q = await supabase.from("leads").select("id,status,created_at,updated_at,manager_id,accounts(account_name)").eq("company_id", company.id).eq("id", args.id).maybeSingle();
      if (!q.data) throw new Error("Заявка не найдена");
      data = q.data;
    } else if (name === "update_lead") {
      const updates: any = { id: args.id };
      if (args.status) updates.status = args.status;
      if (args.manager_id !== undefined) updates.manager_id = args.manager_id;
      const q = await supabase.from("leads").update(updates).eq("company_id", company.id).eq("id", args.id).select("id,status,created_at,updated_at,manager_id,accounts(account_name)").maybeSingle();
      if (!q.data) throw new Error("Заявка не найдена");
      data = q.data;
    } else if (name === "list_managers") {
      const q = await supabase.from("managers").select("id,name,is_active,sort_order").eq("company_id", company.id).order("sort_order", { ascending: true });
      data = q.data ?? [];
    } else if (name === "list_sessions") {
      const accountIds = (await supabase.from("accounts").select("id").eq("company_id", company.id)).data?.map((x: any) => x.id) ?? [];
      let q = supabase.from("chat_sessions").select("id,account_id,client_id,client_name,status,created_at").order("created_at", { ascending: false }).limit(200);
      if (args.account_id) {
        if (!(await ownsAccount(supabase, company.id, args.account_id))) throw new Error("Аккаунт не найден");
        q = q.eq("account_id", args.account_id);
      } else if (accountIds.length) {
        q = q.in("account_id", accountIds);
      } else {
        data = []; q = null as any;
      }
      if (q) data = (await q).data ?? [];
    } else if (name === "get_messages") {
      if (!(await ownsSession(supabase, company.id, args.session_id))) throw new Error("Диалог не найден");
      const r = await supabase.from("messages").select("id,sender,text,created_at").eq("session_id", args.session_id).order("created_at", { ascending: true }); data = r.data ?? [];
    } else if (name === "set_session_takeover") {
      if (!(await ownsSession(supabase, company.id, args.session_id))) throw new Error("Диалог не найден");
      if (!["manager_takeover", "ai_active"].includes(args.status)) throw new Error("Неверный статус");
      const q = await supabase.from("chat_sessions").update({ status: args.status }).eq("id", args.session_id).select("id,account_id,client_name,status").maybeSingle();
      if (!q.data) throw new Error("Диалог не найден");
      data = q.data;
    } else {
      throw new Error("Метод не реализован");
    }

    return rpc(body.id, { data });
  } catch (e: any) {
    return rpcError(body.id, e.code ?? -32000, e.message ?? "Unknown error");
  }
}
